;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.9.3
;              See license for terms of use                        */
;
;	_pli_OSCreateThread - PL/I runtime support routines
;       Version 0.9.3 (Linux)
;       Copyright Peter Flass
;
; Function: Start thread
;
; Calling Sequence: RC = _pli_OSCreateThread( 
;					   pStack,
;					   ulParameter,
;					   ulFlags );
;		+08 pStack:       Addr(thread stack) as above
;		+0C ulFlags:      Thread flags (not used)
;
;		BeginThread has allocated the thread stack and
;		primed it as follows:
;	   		ESP+0 ('00'x) addr(thread procedure)
;		    ==> ESP for thread procedure points here
; 	
; Returns:  Positive Thread ID of new thread or negative error code.
;
;	To Do:
;         This procedure currently uses only the 'old'
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
	public _pli_OSCreateThread
	.data
_pli_data equ $

;clone_flags dd	00042F11h		; SIGCHLD + Flags
clone_flags dd	0005AF00h               ; 0.9.6
;	clone_flags values:	
;		CLONE_VM	000001xxh	/* set if VM shared between processes */
;		CLONE_FS	000002xxh	/* set if fs info shared between processes */
;		CLONE_FILES	000004xxh	/* set if open files shared between processes */
;		CLONE_SIGHAND	000008xxh	/* set if signal handlers and blocked signals shared */
;		
;		CLONE_PTRACE	000020xxh	/* set if we want to let tracing continue on the child too */
;		CLONE_PARENT	000080xxh	/* set if we want to have the same parent as the cloner */
;
;		CLONE_THREAD	000100xxh	/* Same thread group? */
;		CLONE_SYSVSEM	000400xxh	/* share system V SEM_UNDO semantics */
; 'xx' is the signal to be sent to the parent on termination.



	include framedef.inc
;------------------------------------------------+
;  Unique Stack Data for _pli_CreateThread        |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_CreateThread
loc_siz equ	frm_loc-4	; Adjusted thread stack size
loc_stk equ	frm_loc-8	; Stack base
loc_end equ     frm_loc-12 	; end of local stack
loc_len equ     frm_loc-loc_end	; Length of local stack
frm_siz equ	frm_len+loc_len	; Total stack frame length
	
; 
;-----------------------------------------------------
;	_pli_OSCreateThread: Start a thread
;-----------------------------------------------------
	.code
	byte 20h,10h,10h,28h,11h,10h,00h,00h
	db   '_pli_OSCreateThread' ; Entry point name
	db   19		; Length of name
_pli_OSCreateThread:
	call dword ptr 0[edi]		; Init stack frame
	dd frm_siz			; DSA size
	mov word ptr [ebp-28],81E1h	; Condition prefix flags
     	mov eax,120			; SYS_CLONE		
     	mov ebx,clone_flags		; clone_flags	
	mov ecx,[ebp+8]			; Load stack address
     	xor edx,edx			; addr(child tid)
     	xor esi,esi			; addr(tls descriptor)
     	xor edi,edi			; Threadid in child memory
;					  ecx->top of child stack	                 		
;
;	Linux system call
;
	int 80h
	cmp eax,0			; Is this original or new thread?
	je  thread			; eax=0: new thread
return:                                 ; original thread, return
	mov ebx,dword ptr [ebp-12]
	mov esi,dword ptr [ebp-8]
	mov edi,dword ptr [ebp-4]
	leave
	ret
	
;	
; Call the new thread procedure
; using the new stack 
;
thread:
	mov ebp,esp
	call dword ptr [esp+4]		; call thread procedure
; Never return ...
	
 	.code
_pli_endc equ $
	.data
_pli_endd equ $

	end
