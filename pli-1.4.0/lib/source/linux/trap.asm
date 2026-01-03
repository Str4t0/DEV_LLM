;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;		    Linux Version
;
;	_pli_Trap - PL/I runtime trap handler
;       Version 0.8b -- Mar 2010
;       Copyright Peter Flass
;	
;	This module is called as a result of a system
;	exception.  It is a standard signal handler.
;       It is passed three parameters:
;       1. signal number
;       2. Address of the 'siginfo' record
;       3. Address of the ucontext Record
;	
;	Some exceptions may be handled by this module.
;	The remainder will be passed to SIG.
;
;	Modifications:
;         2011-07-08 - SIGCHLD signal.                            0.9.2
;	  2010-03-05 - Linux version.
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall

ic_sig  equ 16				; 'SIGNAL' function code	

        .data
_pli_data equ $

FPUCW   db 20h,3Fh			; Default x87 ctl word  0.9.10c

	extern _pli_PGT:near		; Program Global Table
	extern _pli_Def_Cond:near	; Default condition flags
	extern _pli_GetTCB:near		;			0.9.2

	include sigaction.inc
	include framedef.inc 

;------------------------------------------------+
;  Local Stack Data for _pli_Trap                |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_start
loc_edi	equ	frm_loc-4	; Caller's EDI
loc_ebp equ     frm_loc-8	; Caller's EBP			20061101
loc_end equ     frm_loc-8	; End of local stack
loc_len equ     frm_loc-loc_end	; Length of local stack
;----------------------------------------------------------------
	
;------------------------------------------------+
;  Address of PGT                                |
;------------------------------------------------+
aPGT	dd    _pli_PGT

_pli_endd equ $

	.code
_pli_code equ $
        public _pli_Trap
; 
;-----------------------------------------------------
;	_pli_Trap:  Linux System Signal Handler
;	[NOT Standard PL/I Linkage]
;-----------------------------------------------------
	db   '_pli_Trap'	; Entry point name
	db   9			; Length of name
Dummy_Entry:			;				20041216
	call dword ptr 0[edi]	; Dummy entry      		20041216
	dd   0			; Dummy DSA size		20041216
_pli_Trap:			; Real entry			20041216
;-------------------------------------------------------------
;	Build a PL/I-compatible stack frame for error handler
;-------------------------------------------------------------
        push ebp		; Save caller's EBP
	mov  ebp,esp		; Save registers
	sub  esp,frm_len+loc_len; Reserve stack frame
	mov  frm_bos[ebp],esp	; Save BOS address
	mov  loc_edi[ebp],edi	; Save caller's registers
	mov  frm_esi[ebp],esi   ;   (edi,esi,ebx)
	mov  frm_ebx[ebp],ebx
	mov  dword ptr frm_epa[ebp],offset Dummy_Entry ; Entry   20041216 
        mov  dword ptr frm_stt[ebp],0		; Statement number table
        mov  dword ptr frm_chc[ebp],0		; Condition handler chain
	mov  ax,word ptr _pli_Def_Cond		; Enabled conditions
	or   ax,0100h				; +Library function 0.7c
	mov  frm_msk[ebp],ax	; Condition mask
	mov  edi,aPGT		; Load PGT address
	mov  frm_edi[ebp],edi	; Look like PL/I DSA for trace
	mov  eax,frm_ebp[ebp]	; Load caller's EBP		20061101
	mov  loc_ebp[ebp],eax	; stash for return		20061101
	cld			; Clear direction flag
; 
;-----------------------------------------------------
;	Fix up exceptions not passed to sig.        
;	[currently only Float inexact result [FPE_FLTRES]
;	It's not worth the time to define these structures
;	in assembler.  See lib/include/ucontext.inc
;	and lib/include/sigcontext.inc
;	There doesn't seem to be a code for denormal op
;----------------------------------------------------
	cmp dword ptr 8[ebp],8	; SIGFPE
	jne signal		; Nope
	mov ebx,12[ebp]		; addr(siginfo)
	cmp dword ptr 8[ebx],6	; FPE_FLTRES
	jne signal		; Nope again
; 	FPU status register       
; 	1... .... ES error summary msk'80'bx
; 	.1.. .... SF stack Fault mask '40'bx
; 	..1. .... PE Precision mask   '20'bx
; 	...1 .... UE Underflow mask   '10'bx
; 	.... 1... OE Overflow mask    '08'bx
; 	.... .1.. ZE Zerodivide mask  '04'bx
; 	.... ..1. DE Denormal Op mask '02'bx
; 	.... ...1 IE Invalid Op mask  '01'bx
fpufixup:					;		20091007
	mov ebx,16[ebp]		; addr(ucontext)                        LINUX
	add ebx,20		; addr(mcontext)
 	mov ebx, dword ptr 76[ebx] ; pfpstate
; 	and byte ptr 4[ebx],0DFh  ; Clear fpsw status
 	test byte ptr 4[ebx],05Fh ; Any other errors? (all but ES and PE)
 	jnz signal		  ; Yes, continue with error
	mov byte ptr 4[ebx],00h   ; Else clear summary status
	jmp return		  ; and get out
; 
;-----------------------------------------------------
;	Push arguments for 'SIG':                   
;	First argument:    0=Linux signal      [08]
;	Second argument:   ->siginfo           [0C]
;	Third argument:    ->ucontext          [10]
;----------------------------------------------------
signal:
	mov esi,16[ebp]		; addr(ucontext)                        LINUX
	push esi		; +0C A(ucontext) third arg to sig      LINUX
	mov ebx,12[ebp]		; ->siginfo                             LINUX
	push ebx		; +08 Save as second arg to sig         LINUX
	push 0			; +00 Code for System Exception

;-----------------------------------------------------
;	Call the PL/I condition handler (_pli_Sig)
;-----------------------------------------------------
        fldcw word ptr FPUCW    ; Load default x87 ctl word             20070910
	mov  edi,frm_edi[ebp]	; Load A(PGT) for PL/I call
	mov  al,3		; Number of args for kicks
	call dword ptr [ic_sig*4+edi]	; Call _pli_Sig			20091202
	add  esp,12		; Pop arguments off stack
	mov ebx,8[ebp]		; Reload signal number			LINUX
	cmp ebx,8		; Inaptly named SIGFPE			LINUX
	je  return 		; Continue execution  
	cmp ebx,17		; SIGCHLD             			LINUX
	je  return 		; Continue execution  
	cmp ebx,11		; SIGSEGV              			20100304
	jne term		; No, terminate                         20100304
	mov ebx,12[ebp]		; addr(siginfo)                         20100304
	cmp byte ptr 8[ebx],80h ; Test for fixedoverflow		20100304
	je  return		; Yes, continue execution		20100304
term:				; Terminate thread			20100304
	push 0			; Get current TCB address		0.9.2
	mov  edi,frm_edi[ebp]	; Load A(PGT) for PL/I call		0.9.2
	call _pli_GetTCB	;					0.9.2
	jmp  near ptr 32[eax]	; Jump to thread exit routine		0.9.2
;	lea ebx,_pli_End	;                    			LINUX
;	jmp near ptr[ebx]	;					20091202
		

;-----------------------------------------------------
;	Return to Linux to handle error             
;-----------------------------------------------------
return:
	mov ebx,loc_ebp[ebp]	; Restore caller's EBP			20070814
	mov frm_ebp[ebp],ebx	; 					20070814
	mov ebx,dword ptr frm_ebx[ebp]
	mov esi,dword ptr frm_esi[ebp]
	mov edi,dword ptr loc_edi[ebp]
	leave
	ret

_pli_endc equ $			; addr(termination routine)		LINUX

 	end 
