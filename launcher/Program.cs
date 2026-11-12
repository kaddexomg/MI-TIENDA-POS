using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;

namespace MiTiendaPosLauncher
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string mode = args.Length > 0 ? args[0].ToLower() : "main";

            EnsureServerRunning(baseDir);

            string targetUrl = "http://localhost:7070/index.html";
            if (mode == "caja" || mode == "pos")
            {
                targetUrl = "http://localhost:7070/caja/pos.html";
            }
            else if (mode == "admin")
            {
                targetUrl = "http://localhost:7070/admin/index.html";
            }

            LaunchStandaloneWindow(baseDir, targetUrl);
        }

        static void EnsureServerRunning(string baseDir)
        {
            if (IsPortListening(7070)) return;

            string nodePath = FindNodeExecutable(baseDir);
            string serverScript = Path.Combine(baseDir, "server", "server.js");

            if (!string.IsNullOrEmpty(nodePath) && File.Exists(serverScript))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = nodePath,
                        Arguments = "\"" + serverScript + "\"",
                        WorkingDirectory = baseDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    Process.Start(psi);

                    for (int i = 0; i < 20; i++)
                    {
                        Thread.Sleep(100);
                        if (IsPortListening(7070)) break;
                    }
                }
                catch { }
            }
        }

        static bool IsPortListening(int port)
        {
            try
            {
                using (TcpClient tcp = new TcpClient())
                {
                    IAsyncResult ar = tcp.BeginConnect("127.0.0.1", port, null, null);
                    bool success = ar.AsyncWaitHandle.WaitOne(150);
                    if (success && tcp.Connected)
                    {
                        tcp.EndConnect(ar);
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        static string FindNodeExecutable(string baseDir)
        {
            string[] localPaths = new string[]
            {
                Path.Combine(baseDir, "node", "node.exe"),
                Path.Combine(baseDir, "server", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe")
            };

            foreach (string p in localPaths)
            {
                if (File.Exists(p)) return p;
            }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("where", "node.exe")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true
                };
                using (Process proc = Process.Start(psi))
                {
                    string output = proc.StandardOutput.ReadToEnd();
                    proc.WaitForExit();
                    if (!string.IsNullOrEmpty(output))
                    {
                        string firstLine = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0].Trim();
                        if (File.Exists(firstLine)) return firstLine;
                    }
                }
            }
            catch { }

            return "node";
        }

        static void LaunchStandaloneWindow(string baseDir, string targetUrl)
        {
            string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MI-TIENDA-POS", "Profile");
            try { Directory.CreateDirectory(profileDir); } catch { }

            string[] browserCandidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
            };

            string foundBrowser = null;
            foreach (string b in browserCandidates)
            {
                if (File.Exists(b))
                {
                    foundBrowser = b;
                    break;
                }
            }

            if (!string.IsNullOrEmpty(foundBrowser))
            {
                string appArgs = string.Format(
                    "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1280,820 --start-maximized --disable-features=Translate,OptimizationHints --disable-extensions --no-first-run --no-default-browser-check",
                    targetUrl,
                    profileDir
                );

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = foundBrowser,
                    Arguments = appArgs,
                    UseShellExecute = true
                };
                Process.Start(psi);
            }
            else
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = targetUrl,
                    UseShellExecute = true
                });
            }
        }
    }
}
