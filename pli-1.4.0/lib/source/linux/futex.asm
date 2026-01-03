;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_sem - PL/I runtime support routines [LINUX]
;       Version 0.8c -- Oct, 2009
;       Copyright Peter Flass
;       This module implements what PL/I needs from Linux
;       semaphores using "FUTEX"es. 
;	Named semaphores are not supported.                     
;
; 	Some code is based on the examples in Ulrich Drepper's
;	paper "Futexes are Tricky"
;	http://people.redhat.com/drepper/futex.pdf	
;
;	To Do:
;	  . 
;	
;       Modifications:
;	  2011-05-13 - Another workaround for JWASM problem    0.0.2
;	  2009-10-19 - Initial version.                       	0.8c
;-------------------------------------------------------
	.486P
	.model flat,syscall
	
        .data
_pli_data equ $

	.code
_pli_code equ $
	db 20h,09h,10h,19h,19h,33h,00h,00h
        public _pli_mutex_init		;
	public _pli_mutex_wait		;
;	public _pli_mutex_trywait
	public _pli_mutex_timedwait	;
	public _pli_mutex_post		;
	public _pli_mutex_destroy		;
	
	include gbl.inc		; PL/I Global data			        
	include tcb.inc		; Task Control Block (TCB)			        
	include framedef.inc
;------------------------------------------------+
;  Unique Stack Data for _pli_mutex_init           |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_Init
loc_ta  equ	frm_loc-4	; addr(time)
loc_end equ     frm_loc-4	; end of local stack		        
loc_len equ     frm_loc-loc_end	; Length of local stack
frm_siz equ	frm_len+loc_len	; Total stack frame length         
	

SYS_FUTEX	equ	240		; 'futex' syscall number
; Futex function codes
FUTEX_WAIT	equ     0
FUTEX_WAKE	equ     1
FUTEX_FD	equ     2
FUTEX_REQUEUE	equ     3
FUTEX_CMP_REQUEUE equ   4
FUTEX_WAKE_OP	equ     5
FUTEX_LOCK_PI	equ     6
FUTEX_UNLOCK_PI	equ     7
FUTEX_TRYLOCK_PI  equ   8
; 
;-----------------------------------------------------
;	_pli_mutex_init:	Initialize semaphore
;	Syntax: (Saimilar to POSIX sem_init)
;	int sem_init(sem_t *sem [, int pshared, unsigned int value]);
;         pshared and value not used here
;-----------------------------------------------------
	db   '_pli_mutex_init'	; Entry point name
	db   15		; Length of name
_pli_mutex_init:
	call dword ptr 0[edi]
	dd frm_siz			; DSA size	                  
	mov word ptr [ebp-28],81E1h	; Condition prefix flags
	mov eax,8[ebp]			; Load addr(futex)
; 	pshared is not used					0.9.3
	mov ebx,12[ebp]			; Load value		0.9.3
	mov 0[eax],ebx			; Init futex
	mov eax,0			; Set return value
	jmp return			; exit
; 
;-----------------------------------------------------
;	_pli_mutex_destroy:Destroy semaphore 
;	Syntax: (Same as POSIX sem_destroy)
;	int sem_destroy(sem_t *sem);
;-----------------------------------------------------
	db   '_pli_mutex_destroy'		; Entry point name
	db   18		; Length of name
_pli_mutex_destroy:
	call dword ptr 0[edi]
	dd frm_siz			; DSA size	                  
	mov word ptr [ebp-28],81E1h	; Condition prefix flags
	mov edi,8[ebp]			; Load addr(futex)
	mov dword ptr 0[edi],0		; Zero the status
;	The page containing the futex is pinned by the system
;	if anyone is waiting on it.  Maybe we should wake
;	everybody first?
	mov eax,0			; Set return value
	jmp return			; exit
; 
;-----------------------------------------------------
;	_pli_mutex_timedwait:	Wait on semaphore with timeout
;	Syntax: (Same as POSIX sem_timedwait)
;	int sem_timedwait(sem_t *sem);
;-----------------------------------------------------
	db   '_pli_mutex_timedwait'	; Entry point name
	db   20				; Length of name
_pli_mutex_timedwait:
	call dword ptr 0[edi]
	dd   frm_siz			; DSA size	                  
	mov  word ptr [ebp-28],81E1h	; Condition prefix flags
	mov  eax,12[ebp]		; addr(timespec)
	mov  dword ptr [ebp+loc_ta],eax	; save addr
	jmp  wait_common		; go to common wait logic 
; 
;-----------------------------------------------------
;	_pli_mutex_wait:	Wait on semaphore
;	Syntax: (Same as POSIX sem_wait)
;	int sem_wait(sem_t *sem);
;-----------------------------------------------------
	db   '_pli_mutex_wait'		; Entry point name
	db   15				; Length of name
_pli_mutex_wait:
	call dword ptr 0[edi]
	dd   frm_siz			; DSA size	                  
	mov  word ptr [ebp-28],81E1h	; Condition prefix flags
	mov  dword ptr [ebp+loc_ta],0	; no timeout
wait_common:
;--------------------------------------
;	Registers for sys_futex syscall:	
;	 eax: sys_futex
;	 ebx: addr(futex)
;	 ecx: futex_wait
;	 edx: v
;	 esi: null or addr(timeval)
;
;	Status of futex count value:
;	 0=unlocked
;	 1=locked, no waiters
;	 2=locked, one or more waiters
;	Ulrich Drepper's C code for wait:
;if ((c=cmpxchg(v,0,1))!=0) {
;  if (c!=2)
;     c=xchg(v,2);
;  while( c!=0) {
;    futex_wait(&v,2);
;    c = xchg(v,2);
;    }
;  }
;-----------------------
	mov edi,8[ebp]			; Load addr(futex)
	mov eax,0
	mov ecx,1
  lock cmpxchg 0[edi],ecx		; c=cmpxchg(v,0,1)
   	je  havelock 			; Have the lock!
	cmp eax,2			; Any waiters?
	je  while_nz			; not yet
	mov ecx,2
   lock	xchg 0[edi],ecx			; c=xchg(v,2) [atomic]
while_nz:				;			  0.9.2
	cmp ecx,0			; while( c!=0 )
	je  havelock			; Have lock now	
wait_loop:			        ; futex_wait(&val,2))
	mov ebx,edi   			; Addr(futex) [v]	20091202
	mov ecx,FUTEX_WAIT		; Wait function code
	mov edx,2			; Value for compare
	mov esi,dword ptr [ebp+loc_ta]	; addr(timeval) or null                         
	mov eax,SYS_FUTEX		; Syscall number
	int 80h				; futex_wait(&v,2)
	cmp eax,-4			; EINTR?
	je  wait_loop
	cmp eax,-110			; Wait timed out?
	je  timedout			; Yes
	cmp eax,0			; test result
	jne return			; Error occurred
; The error will be returned in eax.
	mov edi,8[ebp]			; Restore futex address	20101106
	mov ecx,2
   lock xchg 0[edi],ecx			; c=xchg(v,2) [atomic]
	jmp while_nz
havelock:
	mov eax,0			; Set return value
	jmp return			; exit
; Timed wait, time expired.  Need to decrement wait count, since
; we're no longer waiting.
timedout:
	mov edi,8[ebp]			; Load addr(futex)
	mov eax,0[edi]			; Get current futex value
atomic_dec1:
	mov ecx,eax
	dec ecx				; Try the decrement
  lock cmpxchg 0[edi],ecx
	jne atomic_dec1			; Retry if unsuccessful
	mov eax,-110			; Set ETIMEDOUT
	jmp return
; 
;-----------------------------------------------------
;	_pli_mutex_post:	Post semaphore   
;	Syntax: (Same as POSIX sem_post)
;	int sem_post(sem_t *sem);
;-----------------------------------------------------
	db   '_pli_mutex_post'		; Entry point name
	db   15				; Length of name
_pli_mutex_post:
	call dword ptr 0[edi]
	dd   frm_siz			; DSA size	                  
	mov  word ptr [ebp-28],81E1h	; Condition prefix flags
;-----------------------
; if (atomic_dec(v)!=1) {
;   v=0;
;   futex_wake(&v,1);
;   }   
;-----------------------
	mov edi,8[ebp]			; Load addr(futex)
atomic_dec:
	mov eax,0[edi]			; Get current futex value
	mov ecx,eax
  	dec ecx				; Try the decrement
  lock cmpxchg 0[edi],ecx
	jne atomic_dec			; Retry if unsuccessful
 	mov ecx,eax			; Stash result
	mov eax,0			; Set return code=0
	cmp ecx,1			; if( atomic_dec(v)==1 )
  	je return    			; Return
	mov dword ptr 0[edi],0		; v=0
	mov ebx,edi			; Futex address
	mov ecx,FUTEX_WAKE		; Wake function code
	mov edx,7FFFFFFFh		; Wake up all waiters        
	mov eax,SYS_FUTEX		; Syscall number
	int 80h				; futex_wake(&v,1)	         			
; Apparently this returns -EACCESS if no one is waiting on the futex.
	jmp return			; Exit with futex return code
;	
;-----------------------------------------------------
;	Return to caller
;-----------------------------------------------------
return:	
;	cmp ecx,-11			; EAGAIN
;  	je ret1    			; Return
;	mov eax,0
ret1:
;  JWAsm, like most assemblers, attempts to optimize this
;  so it's coded in hex.	
;  lock add dword ptr 0[esp],00000000h  ; memory barrier
        db 0F0h,81h,04h,24h,00h,00h,00h,00h
	mov ebx,dword ptr [ebp-12]
	mov esi,dword ptr [ebp-8]
	mov edi,dword ptr [ebp-4]
	leave
	ret

_pli_endc equ $
	.data
	org _pli_data+00h
_pli_endd equ $
	end
