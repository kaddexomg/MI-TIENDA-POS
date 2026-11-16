'use strict';

/**
 * server/ssl.js
 * Generador puro en Node.js (sin OpenSSL externo) de certificado X.509v3 autofirmado
 * para habilitar HTTPS local (puerto 7443) y permitir getUserMedia (cámara en vivo)
 * desde Chrome/Safari en teléfonos vía Wi-Fi LAN o Tailscale.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function encodeLength(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length].concat(bytes));
}

function asn1(tag, content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return Buffer.concat([Buffer.from([tag]), encodeLength(body.length), body]);
}

function asn1Seq(items) {
  return asn1(0x30, Buffer.concat(items));
}

function asn1Set(items) {
  return asn1(0x31, Buffer.concat(items));
}

function asn1Int(bufOrNum) {
  let b;
  if (typeof bufOrNum === 'number') {
    const arr = [];
    let n = bufOrNum;
    if (n === 0) arr.push(0);
    while (n > 0) {
      arr.unshift(n & 0xff);
      n >>= 8;
    }
    b = Buffer.from(arr);
  } else {
    b = Buffer.from(bufOrNum);
  }
  while (b.length > 1 && b[0] === 0 && (b[1] & 0x80) === 0) {
    b = b.slice(1);
  }
  if (b[0] & 0x80) {
    b = Buffer.concat([Buffer.from([0x00]), b]);
  }
  return asn1(0x02, b);
}

function asn1Oid(oidStr) {
  const parts = oidStr.split('.').map(function (x) { return parseInt(x, 10); });
  const bytes = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    if (v === 0) {
      bytes.push(0);
      continue;
    }
    const sub = [];
    while (v > 0) {
      sub.unshift(v & 0x7f);
      v >>= 7;
    }
    for (let j = 0; j < sub.length - 1; j++) sub[j] |= 0x80;
    for (let j = 0; j < sub.length; j++) bytes.push(sub[j]);
  }
  return asn1(0x06, Buffer.from(bytes));
}

function asn1Utf8(str) {
  return asn1(0x0c, Buffer.from(String(str), 'utf8'));
}

function asn1UtcTime(date) {
  const y = String(date.getUTCFullYear() % 100).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return asn1(0x17, Buffer.from(y + m + d + hh + mm + ss + 'Z', 'ascii'));
}

function asn1BitString(buf) {
  return asn1(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}

function asn1OctetString(buf) {
  return asn1(0x04, buf);
}

function collectLocalIps() {
  const ips = ['127.0.0.1'];
  const ifs = os.networkInterfaces ? os.networkInterfaces() : {};
  Object.keys(ifs).forEach(function (k) {
    (ifs[k] || []).forEach(function (a) {
      if (a && a.family === 'IPv4' && a.address && ips.indexOf(a.address) === -1) {
        ips.push(a.address);
      }
    });
  });
  return ips;
}

function buildSanExtension(ips) {
  const entries = [
    asn1(0x82, Buffer.from('localhost', 'ascii')),
    asn1(0x82, Buffer.from('mitienda.local', 'ascii'))
  ];
  ips.forEach(function (ip) {
    const parts = ip.split('.').map(function (n) { return parseInt(n, 10) & 0xff; });
    if (parts.length === 4) {
      entries.push(asn1(0x87, Buffer.from(parts)));
    }
  });
  const sanValue = asn1Seq(entries);
  return asn1Seq([
    asn1Oid('2.5.29.17'), // subjectAltName
    asn1OctetString(sanValue)
  ]);
}

function toPem(derBuf, label) {
  const b64 = derBuf.toString('base64');
  const lines = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return '-----BEGIN ' + label + '-----\n' + lines.join('\n') + '\n-----END ' + label + '-----\n';
}

function generateSelfSignedCert(ips) {
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });

  const serial = crypto.randomBytes(12);
  serial[0] &= 0x7f;
  if (serial[0] === 0) serial[0] = 1;

  // sha256WithRSAEncryption (1.2.840.113549.1.1.11) + NULL
  const sigAlg = asn1Seq([asn1Oid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00])]);

  const name = asn1Seq([
    asn1Set([asn1Seq([asn1Oid('2.5.4.3'), asn1Utf8('MI-TIENDA-POS Local CA')])]),
    asn1Set([asn1Seq([asn1Oid('2.5.4.10'), asn1Utf8('MI-TIENDA-POS')])])
  ]);

  const now = new Date(Date.now() - 86400000);
  const exp = new Date(Date.now() + 3650 * 86400000);
  const validity = asn1Seq([asn1UtcTime(now), asn1UtcTime(exp)]);

  const basicConstraints = asn1Seq([
    asn1Oid('2.5.29.19'),
    asn1OctetString(asn1Seq([]))
  ]);

  const extensions = asn1(0xa3, asn1Seq([
    basicConstraints,
    buildSanExtension(ips || collectLocalIps())
  ]));

  const tbs = asn1Seq([
    asn1(0xa0, asn1Int(2)), // v3
    asn1Int(serial),
    sigAlg,
    name,
    validity,
    name,
    pair.publicKey,
    extensions
  ]);

  const privPem = toPem(pair.privateKey, 'PRIVATE KEY');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(tbs);
  const signature = signer.sign(privPem);

  const certDer = asn1Seq([
    tbs,
    sigAlg,
    asn1BitString(signature)
  ]);

  return {
    key: privPem,
    cert: toPem(certDer, 'CERTIFICATE')
  };
}

function getOrCreateSslCredentials(dataDir) {
  const ips = collectLocalIps();
  const ipsTag = ips.slice().sort().join(',');
  if (dataDir) {
    try {
      const sslDir = path.join(dataDir, 'ssl');
      if (!fs.existsSync(sslDir)) fs.mkdirSync(sslDir, { recursive: true });
      const keyFile = path.join(sslDir, 'server.key');
      const certFile = path.join(sslDir, 'server.crt');
      const metaFile = path.join(sslDir, 'ips.txt');
      if (fs.existsSync(keyFile) && fs.existsSync(certFile) && fs.existsSync(metaFile)) {
        const savedIps = fs.readFileSync(metaFile, 'utf8').trim();
        if (savedIps === ipsTag) {
          return {
            key: fs.readFileSync(keyFile, 'utf8'),
            cert: fs.readFileSync(certFile, 'utf8')
          };
        }
      }
      const generated = generateSelfSignedCert(ips);
      fs.writeFileSync(keyFile, generated.key, 'utf8');
      fs.writeFileSync(certFile, generated.cert, 'utf8');
      fs.writeFileSync(metaFile, ipsTag, 'utf8');
      return generated;
    } catch (e) {
      // Fallback en memoria
    }
  }
  return generateSelfSignedCert(ips);
}

module.exports = {
  getOrCreateSslCredentials: getOrCreateSslCredentials,
  generateSelfSignedCert: generateSelfSignedCert
};
