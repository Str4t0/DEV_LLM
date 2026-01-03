;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_Trap - PL/I runtime trap handler
;       Version 0.1 Alpha -- Apr, 2002
;       Copyright Peter Flass
;	
;	This module is called as a result of an OS/2
;	system exception.  It is a standard trap handler.
;       It is passed four parameters:
;       1. Address of the Exception Report Record
;       2. Address of PL/I's Exception Registration Record
;          The dword following the standard Registration Record
;          will contain the address of the current ATTENTION ONCB
;          for use by XCPT_SIGNAL processing.
;       3. Address of the Context Record
;       4. Address of the Dispatcher Context
;	
;	Some exceptions [e.g. stack faults] should be handled
;	by this module.  The remainder will be signaled as
;	PL/I ON-CONDITIONS.
;
;	Modifications:
;         2020-09-08 - Floating point errors               0.9.10c
;	  2009-10-27 - Extract data from old DSA	      0.8d
;	  2009-10-07 - Ignore XCPT_FLOAT_DENORMAL_OPERAND     0.8c
;	  2006-11-01 - Fixup EBP from context record to
;			provide a link over exception handler.
;	  2006-09-21 - Try to continue exceptions
;	  2004-12-22 - 
;	  2004-12-16 - Add dummy entry point
;	  2004-05-27 - Remove debugging code
;	
;-------------------------------------------------------
	.386P
	.model flat,syscall

ic_sig  equ 16				; 'SIGNAL' function code	

        .data
_pli_data equ $

FPUCW   db 20h,0Fh			; Default x87 ctl word  20091008

	extern _pli_PGT:near		; Program Global Table
	extern _pli_def_cond:near	; Default condition flags

	include xcpt.inc
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
	extern DosExit:near
	extern DosWrite:near
; 
;-----------------------------------------------------
;	_pli_Trap:  OS/2 System Trap Handler
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
	mov  dword ptr frm_epa[ebp],offset Dummy_Entry ; Entry   0.9.10c  
        mov  dword ptr frm_stt[ebp],0		; Stmt num table 0.9.10c
        mov  dword ptr frm_chc[ebp],0		; Cond hand chn  0.9.10c 
	mov  ax,word ptr _pli_Def_Cond		; Enabled cond   0.9.10c
	or   ax,0100h				; +Library funct 0.9.10c 
	mov  frm_msk[ebp],ax	; Condition mask                 0.9.10c
	mov  edi,aPGT		; Load PGT address
	mov  frm_edi[ebp],edi	; Look like PL/I DSA for trace
	mov  eax,frm_ebp[ebp]	; Load caller's EBP		20061101
	mov  loc_ebp[ebp],eax	; stash for return		20061101
	cld			; Clear direction flag
; 
;-----------------------------------------------------
;	Fix up exceptions not passed to sig.        
;	[currently only Float inexact result [XCPT_FLOAT_INEXACT_RESULT]
;	It's not worth the time to define these structures
;	in assembler.  See lib/include/exrptrec.inc
;----------------------------------------------------
        mov esi,16[ebp]		; +8 A(ContextRecord)		20061101
	mov edi,98h[esi]	; A(ctx_ebp)			20061101
	mov frm_ebp[ebp],edi	; Save for backchain		20061101
;	Now that we have the correct prior DSA, set some stuff	20091027
	mov  dword ptr frm_epa[ebp],offset Dummy_Entry ; Entry  20041216 
	mov  eax,dword ptr frm_stt[edi]	;			20091027
	mov  dword ptr frm_stt[ebp],eax	; Statement number table20091027
	mov  eax,dword ptr frm_chc[edi]	;			20091027
	mov  dword ptr frm_chc[ebp],eax	; Condition handler chai10091027
	mov  ax,word ptr frm_msk[edi]	; Enabled conditions	20091027
	or   ax,0100h			; +Library function 0.7c20091027
	mov  frm_msk[ebp],ax	; Condition mask		20091027
        mov esi,8[ebp]		; A(ExceptionReportRecord)
	mov ebx,dword ptr 0[esi]; Exception Number
	cmp ebx,XCPT_BREAKPOINT
	je  cont		; Continuable (ignored)
	cmp ebx,XCPT_SINGLE_STEP
	je  cont
	cmp ebx,XCPT_GUARD_PAGE_VIOLATION
	je  cont
	cmp ebx,XCPT_FLOAT_INEXACT_RESULT	;		20070814
	je  fpufixup                           	;		0.9.10c 
	cmp ebx,XCPT_UNWIND	; Check for exceptions to be ignored
	je  nocont		; Not continuable
	cmp ebx,XCPT_NONCONTINUABLE_EXCEPTION
	je  nocont
	cmp ebx,XCPT_PROCESS_TERMINATE
	je  nocont
        jmp signal                              ;               0.9.10c
;       FLT_INEXACT_RESULT
;       This code clears the exception flags in the context area.
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
 	mov ebx,16[ebp]		; A(contextRecord)		20070814
;	and byte ptr 8[ebx],0DDh  ; Clear error status		0.9.10c
 	test byte ptr 8[ebx],05Fh ; Any signal errors? (all but ES and PE)
	jnz cont		  ; Yes, continue		20070814
	mov byte ptr 8[ebx],00h	  ; No, clear summary Status	20070814
	jmp cont		; Continue this exception	20070814

;-----------------------------------------------------
;	Other exceptions -
;	Call the PL/I condition handler (_pli_Sig)
;-----------------------------------------------------
signal:				;					20070814
        fldcw word ptr FPUCW    ; Load default x87 ctl word             20070910
        mov  esi,12[ebp]	; +12 A(ExceptionRegistrationRecord)	20041222
	mov  esi,8[esi]		; A(ATTENTION ONCB)			20041222
	push esi		;					20041222
        mov  esi,16[ebp]	; +8 A(ContextRecord)
	push esi		; 
        mov  esi,8[ebp]		; +4 A(ExceptionReportRecord)
	push esi		; 
	push 0			; +0 Code for System Exception
	mov  edi,frm_edi[ebp]	; Load A(PGT) for PL/I call
	mov  al,3		; Number of args for kicks
	call dword ptr [ic_sig*4+edi]	; Call _pli_Sig
	add  esp,12		; Pop arguments off stack

        mov  esi,8[ebp]		; A(ExceptionReportRecord)
	mov  ebx,dword ptr 0[esi]; Exception Number
	cmp  ebx,XCPT_ASYNC_PROCESS_TERMINATE ;                            0.9.1
        je   cont                             ;                            0.9.2
	cmp  ebx,XCPT_SIGNAL	; Signal exception?
;	jne  nocont		; ***Not Continuable***			20060921
	jne  cont		; No, continuable			20060921
	mov  ebx,dword ptr 20[esi] ; ExceptionInfo[0]
	cmp  ebx,3		; XCPT_SIGNAL_KILLPROC
	je   nocont		; not continuable
	jmp  cont		; Continue if handler returns here	
; 
;-----------------------------------------------------
;	Return to OS/2 with or without
;	attempting to continue                        
;-----------------------------------------------------
nocont:				; Don't continue
	mov eax,XCPT_CONTINUE_SEARCH
	jmp return
cont:				; Attempt to continue
	mov eax,XCPT_CONTINUE_EXECUTION
return:
	mov ebx,loc_ebp[ebp]	; Restore caller's EBP			20070814
	mov frm_ebp[ebp],ebx	; 					20070814
	mov ebx,dword ptr frm_ebx[ebp]
	mov esi,dword ptr frm_esi[ebp]
	mov edi,dword ptr loc_edi[ebp]
	leave
	ret

_pli_endc equ $

 	end 
