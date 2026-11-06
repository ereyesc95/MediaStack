# MyStack launcher - restart API (no browser) + Vite UI (opens browser).
# Double-click start-mystack.bat, or: powershell -File start-mystack.ps1
# Prefers one Windows Terminal window with two tabs; falls back to two cmd windows.
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Frontend = Join-Path $Root "frontend"
$ApiPort = 8766
$UiPort = 5174
$UiUrl = "http://localhost:5174/"
$ApiTitle = "MyStack API"
$UiTitle = "MyStack UI"
$HelperDir = Join-Path $env:TEMP "mystack-launcher"
$HwndFile = Join-Path $HelperDir "hwnds.txt"

function Stop-PortListener([int]$Port) {
  try {
    $pids = @(
      Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
  } catch {
    $pids = @()
  }
  foreach ($procId in $pids) {
    if ($procId -and $procId -ne 0) {
      Write-Host "Stopping process $procId on port $Port..."
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Initialize-WindowCloser {
  # Unique type name so definition updates are picked up across launcher iterations.
  if ([type]::GetType("MyStackWinClose2", $false, $false)) { return }
  Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class MyStackWinClose2 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")]
  static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam,
    uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

  const uint WM_CLOSE = 0x0010;
  const uint WM_SYSCOMMAND = 0x0112;
  const uint SC_CLOSE = 0xF060;
  const uint SMTO_ABORTIFHUNG = 0x0002;
  const string CascadiaClass = "CASCADIA_HOSTING_WINDOW_CLASS";

  static bool IsBrowserTitle(string title) {
    return title.IndexOf("Chrome", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Edge", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Firefox", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Opera", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Brave", StringComparison.OrdinalIgnoreCase) >= 0;
  }

  static bool IsMyStackConsoleTitle(string title, string root, string frontend) {
    if (string.IsNullOrEmpty(title) || IsBrowserTitle(title)) return false;
    if (title.Equals("MyStack", StringComparison.OrdinalIgnoreCase)) return true;
    if (title.IndexOf("MyStack API", StringComparison.OrdinalIgnoreCase) >= 0) return true;
    if (title.IndexOf("MyStack UI", StringComparison.OrdinalIgnoreCase) >= 0) return true;
    if (!string.IsNullOrEmpty(root) && title.Equals(root, StringComparison.OrdinalIgnoreCase)) return true;
    if (!string.IsNullOrEmpty(frontend) && title.Equals(frontend, StringComparison.OrdinalIgnoreCase)) return true;
    return false;
  }

  static bool IsCascadia(IntPtr hWnd) {
    var cls = new StringBuilder(256);
    GetClassName(hWnd, cls, cls.Capacity);
    return string.Equals(cls.ToString(), CascadiaClass, StringComparison.Ordinal);
  }

  public static void CloseHwnd(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero || !IsWindow(hWnd)) return;
    // SC_CLOSE is required for Windows Terminal; plain WM_CLOSE is ignored.
    IntPtr result;
    SendMessageTimeout(
      hWnd, WM_SYSCOMMAND, (IntPtr)SC_CLOSE, IntPtr.Zero,
      SMTO_ABORTIFHUNG, 2000, out result);
    if (IsWindow(hWnd)) {
      PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
    }
  }

  public static long[] FindMyStackHwnds(string root, string frontend) {
    var targets = new List<long>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(512);
      if (GetWindowText(hWnd, sb, sb.Capacity) <= 0) return true;
      if (!IsMyStackConsoleTitle(sb.ToString(), root, frontend)) return true;
      targets.Add(hWnd.ToInt64());
      return true;
    }, IntPtr.Zero);
    return targets.ToArray();
  }

  public static int CloseHwnds(long[] hwnds) {
    if (hwnds == null) return 0;
    int n = 0;
    foreach (var raw in hwnds) {
      var h = new IntPtr(raw);
      if (!IsWindow(h)) continue;
      CloseHwnd(h);
      n++;
    }
    return n;
  }

  public static int CloseMyStackConsoles(string root, string frontend) {
    return CloseHwnds(FindMyStackHwnds(root, frontend));
  }

  public static long[] FindAllCascadiaHwnds() {
    var targets = new List<long>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      if (!IsCascadia(hWnd)) return true;
      targets.Add(hWnd.ToInt64());
      return true;
    }, IntPtr.Zero);
    return targets.ToArray();
  }

  public static bool IsAlive(long hwnd) {
    return IsWindow(new IntPtr(hwnd));
  }
}
"@
}

function Get-MyStackCmdProcesses {
  $frontendEsc = [regex]::Escape($Frontend)
  $rootEsc = [regex]::Escape($Root)
  $helperEsc = [regex]::Escape($HelperDir)
  @(
    Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" -ErrorAction SilentlyContinue |
      Where-Object {
        $_.CommandLine -and (
          $_.CommandLine -match 'title MyStack' -or
          $_.CommandLine -match 'mystack-api\.cmd' -or
          $_.CommandLine -match 'mystack-ui\.cmd' -or
          $_.CommandLine -match $helperEsc -or
          $_.CommandLine -match ("{0}.*run\.py.*--no-browser" -f $rootEsc) -or
          $_.CommandLine -match 'run\.py.*--no-browser' -or
          (
            $_.CommandLine -match $frontendEsc -and
            $_.CommandLine -match '(npm|vite|run dev)'
          )
        )
      }
  )
}

function Read-SavedHwnds {
  if (-not (Test-Path $HwndFile)) { return @() }
  try {
    return @(
      Get-Content -Path $HwndFile -ErrorAction Stop |
        Where-Object { $_ -match '^\d+$' } |
        ForEach-Object { [int64]$_ }
    )
  } catch {
    return @()
  }
}

function Save-MyStackHwnds([long[]]$BeforeCascadia) {
  try {
    Initialize-WindowCloser
    New-Item -ItemType Directory -Force -Path $HelperDir | Out-Null
    $tracked = New-Object System.Collections.Generic.List[int64]

    # Prefer title match; WT may later rename the window to the active profile.
    for ($i = 0; $i -lt 10; $i++) {
      Start-Sleep -Milliseconds 300
      foreach ($h in @([MyStackWinClose2]::FindMyStackHwnds($Root, $Frontend))) {
        if (-not $tracked.Contains($h)) { [void]$tracked.Add($h) }
      }
      if ($tracked.Count -gt 0) { break }
    }

    # Fallback: Cascadia windows that appeared after we launched.
    if ($tracked.Count -eq 0) {
      $beforeSet = @{}
      foreach ($h in @($BeforeCascadia)) { $beforeSet[$h] = $true }
      foreach ($h in @([MyStackWinClose2]::FindAllCascadiaHwnds())) {
        if (-not $beforeSet.ContainsKey($h)) {
          [void]$tracked.Add($h)
        }
      }
    }

    if ($tracked.Count -gt 0) {
      $tracked.ToArray() | Set-Content -Path $HwndFile -Encoding Ascii
      Write-Host "Tracked $($tracked.Count) MyStack terminal window(s) for next restart."
    } else {
      Remove-Item -Path $HwndFile -Force -ErrorAction SilentlyContinue
      Write-Host "Warning: could not track MyStack terminal HWND for next restart."
    }
  } catch {
    Write-Host "HWND track skipped: $($_.Exception.Message)"
  }
}

function Find-MyStackHwndsByTab {
  # Window title is often the *active* tab (e.g. "Windows PowerShell") even when a
  # MyStack API/UI tab still exists — scan tab names via UI Automation.
  $found = New-Object System.Collections.Generic.List[int64]
  try {
    Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
    Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $clsCond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ClassNameProperty,
      "CASCADIA_HOSTING_WINDOW_CLASS"
    )
    $windows = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Children,
      $clsCond
    )
    $tabCond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::TabItem
    )
    foreach ($w in $windows) {
      try {
        $hwnd = [int64]$w.Current.NativeWindowHandle
        if ($hwnd -eq 0) { continue }
        $name = [string]$w.Current.Name
        $hit = $false
        if ($name -match 'MyStack API|MyStack UI' -or $name -eq 'MyStack') {
          $hit = $true
        } else {
          $tabs = $w.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            $tabCond
          )
          foreach ($tab in $tabs) {
            $tn = [string]$tab.Current.Name
            if ($tn -match 'MyStack API|MyStack UI') { $hit = $true; break }
          }
        }
        if ($hit -and -not $found.Contains($hwnd)) { [void]$found.Add($hwnd) }
      } catch {
        # skip window
      }
    }
  } catch {
    # UIA optional
  }
  return @($found.ToArray())
}

function Stop-MyStackConsoles {
  Initialize-WindowCloser

  # Collect every HWND we can: saved, title match, and tab-name match.
  $hwnds = New-Object System.Collections.Generic.List[int64]
  foreach ($h in @(Read-SavedHwnds)) { [void]$hwnds.Add($h) }
  foreach ($h in @([MyStackWinClose2]::FindMyStackHwnds($Root, $Frontend))) {
    if (-not $hwnds.Contains($h)) { [void]$hwnds.Add($h) }
  }
  foreach ($h in @(Find-MyStackHwndsByTab)) {
    if (-not $hwnds.Contains($h)) { [void]$hwnds.Add($h) }
  }

  if ($hwnds.Count -gt 0) {
    $n = [MyStackWinClose2]::CloseHwnds($hwnds.ToArray())
    Write-Host "Closing $n MyStack terminal window(s)..."
  }

  # Kill MyStack cmd shells (and children).
  $cmds = @(Get-MyStackCmdProcesses)
  foreach ($procId in @($cmds | ForEach-Object { [int]$_.ProcessId } | Select-Object -Unique)) {
    Write-Host "Stopping MyStack cmd PID $procId..."
    & taskkill.exe /PID $procId /T /F 2>$null | Out-Null
  }

  Get-Process -Name cmd -ErrorAction SilentlyContinue | ForEach-Object {
    $title = $_.MainWindowTitle
    if (
      $title -eq "MyStack" -or
      $title -like "*MyStack API*" -or
      $title -like "*MyStack UI*" -or
      $title -eq $Root -or
      $title -eq $Frontend
    ) {
      Write-Host "Stopping titled cmd PID $($_.Id) ($title)..."
      & taskkill.exe /PID $_.Id /T /F 2>$null | Out-Null
    }
  }

  Start-Sleep -Milliseconds 400

  # Close again — WT often ignores the first close until children exit; titles may
  # already have flipped to "Windows PowerShell", so use saved HWNDs.
  if ($hwnds.Count -gt 0) {
    $n2 = [MyStackWinClose2]::CloseHwnds($hwnds.ToArray())
    if ($n2 -gt 0) {
      Write-Host "Re-closed $n2 MyStack terminal window(s)..."
    }
  }
  $n3 = [MyStackWinClose2]::CloseMyStackConsoles($Root, $Frontend)
  if ($n3 -gt 0) {
    Write-Host "Closed $n3 remaining MyStack-titled window(s)..."
  }

  Remove-Item -Path $HwndFile -Force -ErrorAction SilentlyContinue
}

function Initialize-BrowserCloser {
  if ([type]::GetType("MyStackBrowserClose", $false, $false)) { return }
  Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class MyStackBrowserClose {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  const int SW_RESTORE = 9;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const byte VK_CONTROL = 0x11;
  const byte VK_W = 0x57;

  static bool IsBrowserWindowTitle(string title) {
    if (string.IsNullOrEmpty(title)) return false;
    return title.IndexOf("Chrome", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Edge", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Firefox", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Opera", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Brave", StringComparison.OrdinalIgnoreCase) >= 0
        || title.IndexOf("Chromium", StringComparison.OrdinalIgnoreCase) >= 0;
  }

  static bool IsMyStackUiTabTitle(string title) {
    if (string.IsNullOrEmpty(title) || !IsBrowserWindowTitle(title)) return false;
    if (title.IndexOf("localhost:5174", StringComparison.OrdinalIgnoreCase) >= 0) return true;
    if (title.IndexOf("127.0.0.1:5174", StringComparison.OrdinalIgnoreCase) >= 0) return true;
    // Vite page title is "MyStack" -> "MyStack - Google Chrome"
    if (title.StartsWith("MyStack -", StringComparison.OrdinalIgnoreCase)) return true;
    if (title.StartsWith("MyStack —", StringComparison.OrdinalIgnoreCase)) return true;
    return false;
  }

  public static long[] FindMyStackBrowserHwnds() {
    var targets = new List<long>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(512);
      if (GetWindowText(hWnd, sb, sb.Capacity) <= 0) return true;
      if (IsMyStackUiTabTitle(sb.ToString())) targets.Add(hWnd.ToInt64());
      return true;
    }, IntPtr.Zero);
    return targets.ToArray();
  }

  public static int CloseTabs(long[] hwnds) {
    if (hwnds == null) return 0;
    int n = 0;
    foreach (var raw in hwnds) {
      var h = new IntPtr(raw);
      if (!IsWindow(h)) continue;
      ShowWindow(h, SW_RESTORE);
      SetForegroundWindow(h);
      Thread.Sleep(80);
      // Ctrl+W closes the active tab only (not the whole browser).
      keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
      keybd_event(VK_W, 0, 0, UIntPtr.Zero);
      keybd_event(VK_W, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
      keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
      Thread.Sleep(120);
      n++;
    }
    return n;
  }
}
"@
}

function Close-MyStackBrowserTabs {
  # Close existing UI tabs so Vite --open does not stack duplicates.
  try {
    Initialize-BrowserCloser
    $hwnds = New-Object System.Collections.Generic.List[int64]
    foreach ($h in @([MyStackBrowserClose]::FindMyStackBrowserHwnds())) {
      if (-not $hwnds.Contains($h)) { [void]$hwnds.Add($h) }
    }

    # Background tabs: window title may not show localhost:5174 — scan browser tab names.
    try {
      Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
      Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      $tabCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::TabItem
      )
      $tabs = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        $tabCond
      )
      foreach ($tab in $tabs) {
        try {
          $tn = [string]$tab.Current.Name
          if (
            $tn -match 'localhost:5174|127\.0\.0\.1:5174' -or
            $tn -eq 'MyStack' -or
            $tn -like 'MyStack -*' -or
            $tn -like 'MyStack —*'
          ) {
            try {
              $sel = $tab.GetCurrentPattern(
                [System.Windows.Automation.SelectionItemPattern]::Pattern
              )
              if ($sel) {
                $sel.Select()
                Start-Sleep -Milliseconds 100
              }
            } catch {
              # tab may not support SelectionItemPattern
            }
            $win = $tab
            while ($win -and $win.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window) {
              $win = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($win)
            }
            if (-not $win) { continue }
            $winName = [string]$win.Current.Name
            $winClass = [string]$win.Current.ClassName
            # Only browser windows — never Ctrl+W a Terminal tab.
            if (
              $winClass -notmatch 'Chrome_WidgetWin|MozillaWindowClass' -and
              $winName -notmatch 'Chrome|Edge|Firefox|Brave|Opera|Chromium'
            ) {
              continue
            }
            $h = [int64]$win.Current.NativeWindowHandle
            if ($h -ne 0 -and -not $hwnds.Contains($h)) { [void]$hwnds.Add($h) }
          }
        } catch {
          # skip tab
        }
      }
    } catch {
      # UIA optional
    }

    if ($hwnds.Count -eq 0) { return }
    $n = [MyStackBrowserClose]::CloseTabs($hwnds.ToArray())
    if ($n -gt 0) {
      Write-Host "Closed $n MyStack browser tab(s) (localhost:$UiPort)..."
    }
  } catch {
    Write-Host "Browser tab close skipped: $($_.Exception.Message)"
  }
}

function Resolve-Python {
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cmd = Get-Command py -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "Python not found on PATH (tried 'python' and 'py')."
}

function Resolve-Npm {
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cmd = Get-Command npm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "npm not found on PATH. Install Node.js or open a terminal where npm works."
}

function Resolve-WindowsTerminal {
  $cmd = Get-Command wt.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $local = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\wt.exe"
  if (Test-Path $local) { return $local }
  return $null
}

function Write-HelperCmd([string]$Path, [string]$Title, [string]$WorkDir, [string]$Line) {
  $content = @"
@echo off
title $Title
cd /d "$WorkDir"
$Line
"@
  Set-Content -Path $Path -Value $content -Encoding Ascii
}

if (-not (Test-Path (Join-Path $Root "run.py"))) {
  throw "run.py not found in $Root"
}
if (-not (Test-Path (Join-Path $Frontend "package.json"))) {
  throw "frontend/package.json not found"
}

$SetEnv = Join-Path $Root "set-env.ps1"
if (Test-Path $SetEnv) {
  . $SetEnv
}

$Python = Resolve-Python
$Npm = Resolve-Npm
$Wt = Resolve-WindowsTerminal

Write-Host "Restarting MyStack..."
Stop-PortListener $ApiPort
Stop-PortListener $UiPort
Stop-MyStackConsoles
Close-MyStackBrowserTabs

# Ensure prior windows finished closing before opening a new one.
try {
  Initialize-WindowCloser
  for ($i = 0; $i -lt 8; $i++) {
    Start-Sleep -Milliseconds 200
    $left = [MyStackWinClose2]::FindMyStackHwnds($Root, $Frontend)
    $cmdsLeft = @(Get-MyStackCmdProcesses)
    if ($left.Count -eq 0 -and $cmdsLeft.Count -eq 0) { break }
    if ($left.Count -gt 0) {
      [void][MyStackWinClose2]::CloseHwnds($left)
    }
    foreach ($c in $cmdsLeft) {
      & taskkill.exe /PID $c.ProcessId /T /F 2>$null | Out-Null
    }
  }
} catch {
  Start-Sleep -Milliseconds 500
}

New-Item -ItemType Directory -Force -Path $HelperDir | Out-Null
$apiHelper = Join-Path $HelperDir "mystack-api.cmd"
$uiHelper = Join-Path $HelperDir "mystack-ui.cmd"
Write-HelperCmd $apiHelper $ApiTitle $Root "`"$Python`" run.py --no-browser"
Write-HelperCmd $uiHelper $UiTitle $Frontend "`"$Npm`" run dev -- --open $UiUrl"

if ($Wt) {
  Initialize-WindowCloser
  $beforeCascadia = @([MyStackWinClose2]::FindAllCascadiaHwnds())
  # Pin Command Prompt profile so tabs stay titled MyStack API/UI (not PowerShell).
  $wtLine =
    "start `"`" `"$Wt`" -w -1 " +
    "new-tab -p `"Command Prompt`" --title `"$ApiTitle`" -d `"$Root`" cmd /k `"$apiHelper`" " +
    "; " +
    "new-tab -p `"Command Prompt`" --title `"$UiTitle`" -d `"$Frontend`" cmd /k `"$uiHelper`""
  & cmd.exe /c $wtLine
  Write-Host "Opened Windows Terminal with API + UI tabs."
  Save-MyStackHwnds -BeforeCascadia $beforeCascadia
} else {
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $apiHelper)
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $uiHelper)
  Write-Host "Windows Terminal not found - opened two cmd windows."
}

Write-Host "API:  http://127.0.0.1:$ApiPort  (no browser)"
Write-Host "UI:   $UiUrl  (browser via Vite)"
Write-Host "Done - close the MyStack terminal window (or its tabs) to stop the app."
