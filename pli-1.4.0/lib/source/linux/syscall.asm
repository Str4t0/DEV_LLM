;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_Syscall - PL/I runtime support routines
;       Version 0.8c Linux Alpha -- Aug, 2009
;       Copyright Peter Flass
;       This is the Linux system call function            
;
;	Note that this does not follow standard linkage
;	conventions. <why?>
;
;	To Do:
;         This procedure current;y uses only the 'old'
;	  Linux system call int 80h.  It should be
;	  changed to use the standard system routine
;	  __syscall that is mapped into each user's
;	  address space at program load.
;	  See ---(?)---
;	
;       Modifications:
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall

	.code
_pli_code equ $
	public _pli_Syscall
; 
;-----------------------------------------------------
;	_pli_Syscall:  Linux system call
;-----------------------------------------------------
	db   '_pli_Syscall' ; Entry point name
	db   12		; Length of name
_pli_Syscall:
	push ebp	; Save caller's registers
	push edi
        push esi
        push ebx
;
;----------------------------------------------------------------------
;	This procedure doesn't have its own stack frame,
;	and Linux system calls may clobber ebp.
;	At this point the stack looks as follows:
;	            +-----------------------------------+
;	     +14    | Caller's arguments (count in eax) |
;	            +-----------------------------------+
;	     +10    | Caller's eip pushed by call       |
;	            +-----------------------------------+
;	     +0C    | Caller's ebp saved above          |
;	            +-----------------------------------+
;	     +08    | Caller's edi saved above          |
;	            +-----------------------------------+
;	     +04    | Caller's esi saved above          |
;	            +-----------------------------------+
;	            | Caller's ebx saved above          |
;	 esp +00--> +-----------------------------------+
;	All addressing of arguments is done via esp;
;
; EAX contains the argument count on entry, and is not saved or
; restored.  On exit, EAX will return the error code from the system service.
;----------------------------------------------------------------------
;
	cmp eax,1	 	; Validate arg count
	jl  err
	cmp eax,7
	jg  err
	jmp [jtab-4+eax*4]
jtab	equ $			; Jump table
	dd  offset xeax		; one argument
	dd  offset xebx		; two
	dd  offset xecx		; three
	dd  offset xedx		; four
	dd  offset xesi		; five
	dd  offset xedi		; six
	dd  offset xebp		; seven
;
;	This is a good place to put the error return
;
err	equ $
	mov eax,22		; '22' is EINVAL
	jmp return		; exit
;
;	Load arguments in order: ebp-eax
;
xebp:	mov ebp,dword ptr [esp+02ch]		
xedi:	mov edi,dword ptr [esp+028h]		
xesi:	mov esi,dword ptr [esp+024h]		
xedx:	mov edx,dword ptr [esp+020h]		
xecx:	mov ecx,dword ptr [esp+01ch]		
xebx:	mov ebx,dword ptr [esp+018h]		
xeax:	mov eax,dword ptr [esp+014h]		
;
;	Linux system call
;
	int 80h

return:
	pop ebx		; Restore registers
	pop esi
	pop edi
	pop ebp
	ret

	end;

