;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_GetDSA - PL/I runtime support routines
;
;       Version 0.1 Alpha -- Mar, 2001
;       Copyright Peter Flass
;
;       _pli_GetDSA:   Get pointer to DSA 
;       _pli_GetFlags: Get enabled condition flags
;	_pli_SetFlags: Set condition flags
;	_pli_GetGbl:   Get address of "Global" data area.	20040610
;	_pli_GetX87:   Get FPU state				20091006
;	_pli_PutX87:   Put FPU state				20091006
;
;	This stuff could all be done in PL/I, but
;	it would be tricky code and non-portable anyway.
;	It seems cleaner do do it in assembler.
;
;	Note that none of these routines has its own DSA,
;	they all operate with EBP->Caller's DSA.
;
;	Modifications:
;	  2009-10-06 - add "GetX87"
;	  2005-11-10 - add "SetFlags"
;	  2004-08-02 - Fix 'GETFLAGS' so that (when called from
;		       a library procedure) it will return the
;		       flags in effect when that proc was called.
;	  2004-06-10 - add "GetGbl"
;-------------------------------------------------------
	.486P
	.model flat,syscall

	.code
        public _pli_GetDSA
	public _pli_GetFlags
	public _pli_SetFlags				; 20051110		
	public _pli_GetGbl  			        ; 20040610
	public _pli_GetX87				; 20091006
	public _pli_PutX87				; 20091006

_pli_code equ $
	include framedef.inc 
; 
;-----------------------------------------------------
;	_pli_GetDSA:  Return caller's DSA address [EBP]
;-----------------------------------------------------
	db   '_pli_GetDSA'	; Entry point name
	db   11			; Length of name
_pli_GetDSA: 
        mov  eax,ebp		; Return caller's EBP
	ret

;-----------------------------------------------------
;	_pli_GetFlags:  Return caller's enabled cond flags
;-----------------------------------------------------
	db   '_pli_GetFlags'	; Entry point name
	db   13			; Length of name
_pli_GetFlags:
        mov   eax,dword ptr frm_ebp[ebp]; Caller of Caller's DSA  20040802
        movzx eax,word ptr  frm_msk[eax]; Caller of Caller's flags20040802
	xchg  ah,al			; Correct byte order      20040802
	ret

;-----------------------------------------------------
;	_pli_SetFlags:  Set condition flags in DSA
;-----------------------------------------------------
	db   '_pli_SetFlags'	; Entry point name
	db   13			; Length of name
_pli_SetFlags:
;       Non-standard stack frame, no EBP saved                    20060901
	movzx eax,word ptr 4[esp]	; Get new flags		  20060901
;	xchg  ah,al			; Correct byte order      20051110
        mov   word ptr frm_msk[ebp],ax	; Set flags		  20051110
	ret

;-----------------------------------------------------
;	_pli_GetGbl:  Return address of "Global" data
;-----------------------------------------------------
	db   '_pli_GetGbl'	; Entry point name
	db   11			; Length of name
_pli_GetGbl: 
        mov  eax,ebp		; Caller's EBP
	mov  eax,frm_edi[eax]	; addr(PGT)
	mov  eax,dword ptr (127*4)[eax]	; addr(_pli_gbl_data)
	ret

;-----------------------------------------------------		  20091006
;	_pli_GetX87:  Get FPU state				  20091006
;	called with address of 108-byte area			  20091006
;----------------------------------------------------		  20091006
	db   '_pli_GetX87'	; Entry point name		  20091006
	db   11			; Length of name		  20091006
_pli_GetX87:			;				  20091006
;       Non-standard stack frame, no EBP saved                    20091006
	mov   eax,dword ptr 4[esp]	; Get addr to save state  20091006
	fsave [eax]			; save it		  20091006
	ret				;			  20091006

;-----------------------------------------------------		  20091006
;	_pli_PutX87:  Put FPU state				  20091006
;	called with address of 108-byte area			  20091006
;----------------------------------------------------		  20091006
	db   '_pli_PutX87'	; Entry point name		  20091006
	db   11			; Length of name		  20091006
_pli_PutX87:			;				  20091006
;       Non-standard stack frame, no EBP saved                    20091006
	mov   eax,dword ptr 4[esp]	; Get addr of saved state 20091006
	frstor [eax]			; restore it              20091006
	ret				;			  20091006

 	end 

