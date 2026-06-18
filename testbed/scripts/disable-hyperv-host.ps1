# Disables Hyper-V / VBS / Memory Integrity so VirtualBox runs at NATIVE speed.
# Without this, an enabled hypervisor forces VirtualBox into a slow emulation
# mode and the testbed VM boot crawls / times out.
#
# HOW TO RUN:
#   1. Open PowerShell as Administrator (right-click > Run as administrator).
#   2. cd to this folder and run:  .\disable-hyperv-host.ps1
#      (if blocked: powershell -ExecutionPolicy Bypass -File .\disable-hyperv-host.ps1)
#   3. REBOOT Windows.
#
# TO RE-ENABLE LATER (then reboot):
#   bcdedit /set hypervisorlaunchtype auto
#   reg add "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard" /v EnableVirtualizationBasedSecurity /t REG_DWORD /d 1 /f
#   reg add "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity" /v Enabled /t REG_DWORD /d 1 /f
#   ...or just turn Core Isolation > Memory Integrity back On in Windows Security.

#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

Write-Host 'Disabling Memory Integrity (HVCI)...' -ForegroundColor Cyan
reg add 'HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' /v Enabled /t REG_DWORD /d 0 /f | Out-Null

Write-Host 'Disabling Virtualization-Based Security...' -ForegroundColor Cyan
reg add 'HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard' /v EnableVirtualizationBasedSecurity /t REG_DWORD /d 0 /f | Out-Null

Write-Host 'Disabling hypervisor auto-launch...' -ForegroundColor Cyan
bcdedit /set hypervisorlaunchtype off

Write-Host ''
Write-Host 'Done. REBOOT Windows now.' -ForegroundColor Green
Write-Host 'After reboot, verify (should print False):' -ForegroundColor Green
Write-Host '  (Get-CimInstance Win32_ComputerSystem).HypervisorPresent'
