Option Explicit
Dim shell, files, root, node, runner, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(files.GetParentFolderName(WScript.ScriptFullName))
node = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
runner = root & "\scripts\appointment-reminders.cjs"
If Not files.FileExists(node) Or Not files.FileExists(runner) Then WScript.Quit 2
shell.CurrentDirectory = root
command = Chr(34) & node & Chr(34) & " --use-system-ca " & Chr(34) & runner & Chr(34)
' Window style 0 hides the console; wait preserves the task exit code and prevents overlapping runs.
result = shell.Run(command, 0, True)
WScript.Quit result
