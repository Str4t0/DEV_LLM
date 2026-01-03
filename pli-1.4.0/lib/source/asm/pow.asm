
;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_POW  - PL/I runtime support routines
;       Version 0.8A Beta, 15 Dec, 2008
;       Copyright Peter Flass
;
;	This procedure is called to raise x to the power y, where x and y
;	are both FLOAT.  All error checking is presumed to have been done.
;
;	Calling Sequence:
;	  DCL POW entry( float bin(64), float bin(64) )
;	           returns( float bin(64) )
;	           ext( '_pli_POW')
;	           options(linkage(system));
;	  The first number is the base x.               
;	  The second number is the exponent y.               
;
;	To Do:
;	
;       Modifications:
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall
        public _pli_POW
	.data
_pli_data equ $
	include framedef.inc
;------------------------------------------------+
;  Unique Stack Data for _pli_POW                |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_Math
loc_fpc equ     frm_loc-4	; Saved fpucw
loc_end equ     frm_loc-4 	; end of local stack
loc_len equ     frm_loc-loc_end	; Length of local stack
frm_siz equ	frm_len+loc_len	; Total stack frame length

	.code			; PL/I Compatible entry code
_pli_code equ $
	byte 20h,09h,09h,09h,11h,30h,00h,00h
; 
;-----------------------------------------------------
;	_pli_POW: x**y                  
;-----------------------------------------------------
	byte   '_pli_POW'		; Entry point name
	byte   8			; Length of name
_pli_POW:
	call dword ptr 0[edi]		; Init stack frame
	dd frm_siz			; DSA size
	mov word ptr [ebp-28],81E1h	; Condition prefix flags
	fstcw loc_fpc[ebp]		; Save fpcw
	fld   tbyte ptr 20[ebp]		; Load power (y)      
	fld   tbyte ptr 8[ebp]		; Load value to raise (x)
	fld1
	fxch
	fyl2x
	fmulp st(1),st(0)
	fld  st(0)
	frndint
	fxch
	fsub st(0),st(1)
	f2xm1
	fld1
	faddp st(1),st(0)
	fxch
	fld1
	fscale
	fstp st(1)
	fmulp st(1),st(0)		; Result in ST(0)
; 
;-----------------------------------------------------
;	Return to caller               
;-----------------------------------------------------
retrn	equ  $
	fldcw loc_fpc[ebp]		; Restore fpcw
	mov ebx,dword ptr [ebp-12]
	mov esi,dword ptr [ebp-8]  
	mov edi,dword ptr [ebp-4]  
	leave
	ret

	.data

	align	2
fpmask  db      20h,0Bh				; FPU Control word
; 	LOB (exception masks):
; 	..1. .... PE Precision mask   '20'bx
; 	...1 .... UE Underflow mask   '10'bx
; 	.... 1... OE Overflow mask    '08'bx
; 	.... .1.. ZE Zerodivide mask  '04'bx
; 	.... ..1. DE Denormal Op mask '02'bx
; 	.... ...1 IE Invalid Op mask  '01'bx
; 	HOB (control flags):
; 	...1 .... Infinity Control '01'bx
; 	.... xx.. Rounding Control
;		'11'bx - Round toward zero (chop mode)
; 	.... ..xx Precision Control 
;		'11'bx - Double Extended Precision
;						  Double Extended Precision
;						  Round toward nearest
;						  #P masked
 	.code
_pli_endc equ $
	.data
_pli_endd equ $
	end


