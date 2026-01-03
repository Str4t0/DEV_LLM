
;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_Hyper  - PL/I runtime support routines
;       Version 0.9.1 Beta, 15 May, 2008
;       Copyright Peter Flass
;
;	Hyperbolic builtins SINH, COSH, TANH.
;	All error checking is presumed to have been done.
;       This duplicates code from POW to compute e**x.
;
;       The applicable formulas are:
;          SINH(x) = .5 * ( e**x - e**-x )
;          COSH(x) = .5 * ( e**x + e**-x )
;          TANH(x) = SINH(x)/COSH(x)
;
;	Calling Sequence:
;	  DCL HYPER entry( fixed bin(31), float bin(64) )
;	            returns( float bin(64) )
;	            ext( '_pli_Hyper')
;	            options(linkage(system));
;	  The first argument is the function to be performed 
;	     16 = sinh    
;	      7 = cosh
;	     20 = tanh
;	  (These are the function codes that would be used by _pli_Math)
;	  The second argument is the function argument.
;
;	To Do:
;	
;       Modifications:
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall
        public _pli_Hyper
	.data
_pli_data equ $
	include framedef.inc
;------------------------------------------------+
;  Unique Stack Data for _pli_Hyper              |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_Math
loc_fpc equ     frm_loc-4	; Saved fpucw
loc_end equ     frm_loc-4 	; end of local stack
loc_len equ     frm_loc-loc_end	; Length of local stack
frm_siz equ	frm_len+loc_len	; Total stack frame length

	.code			; PL/I Compatible entry code
_pli_code equ $
	byte 20h,10h,05h,13h,11h,30h,00h,00h
; 
;-----------------------------------------------------
;	_pli_Hyper: x**y                  
;-----------------------------------------------------
	byte   '_pli_Hyper'		; Entry point name
	byte   10			; Length of name
_pli_Hyper:
	call dword ptr 0[edi]		; Init stack frame
	dd frm_siz			; DSA size
	mov word ptr [ebp-28],81E1h	; Condition prefix flags
	fstcw loc_fpc[ebp]		; Save fpcw
; NOTE: We could change the FPU rounding if desired.
;	Compute e**x
compute:
	fld   tbyte ptr 12[ebp]		; Load power (x)      
	fld   tbyte ptr e    		; Load base (e)           
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
	fmulp st(1),st(0)		; e**x in ST(0)
	fld st(0)
	fld1
	fdivr 				; e**-x in ST(0), e**x in ST(1)
	cmp byte ptr 8[ebp],16		; Is this SINH?
	je do_sinh			; yes
	cmp byte ptr 8[ebp],20		; Is this TANH?
	jne do_cosh			; no
do_tanh:
;	ST(0)=e**-x, ST(1)=e**x	
	fld st(1)			; e**x in ST(0) and ST(2)
	fld st(1)			; e**-x in ST(0) and ST(2)
	fsubp st(1),st(0)
	fxch st(2)			; sinh*2 in st(2)
	faddp st(1),st(0)		; cosh*2 in ST(0)
	fdivp st(1),st(0)		; sinh/cosh
	jmp retrn
do_cosh:
	fadd
	fild dword ptr two
	fdivp st(1),st(0)		; /2
	jmp retrn
do_sinh:
	fsub
	fild dword ptr two
	fdivp st(1),st(0)		; /2
	jmp retrn
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
	align	4
e	db 81h,4Ah,0BBh,0A2h,58h,54h,0F8h,0ADh,00h,40h
two	dd 2

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


