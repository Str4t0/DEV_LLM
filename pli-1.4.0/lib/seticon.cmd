/* seticon: sets an icon for a file */
parse arg file ',' icon .
file=strip(file)
icon=strip(icon)
call RxFuncAdd 'SysSetIcon', 'RexxUtil', 'SysSetIcon'
RC = SysSetIcon(file,icon) 
if RC=0 then say "SysSetIcon Failed"

