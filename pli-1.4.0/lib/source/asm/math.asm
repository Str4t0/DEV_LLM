;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_Math - PL/I runtime support routines
;       Version 0.8A Beta, 15 Dec, 2008
;       Copyright Peter Flass
;
;	This procedure is called to perform various math functions for 
;	which the compiler does not generate the appropriate instructions.
;
;       Note that not all listed functions are implemented here.
;       Some trig functions are in hyper.asm, and some more complex
;       functions are in separate PL/I procedures.
;
;	Calling Sequence:
;	  DCL MATH entry( fixed bin(31), float bin(64) )
;	           returns( float bin(64)
;	           ext( '_pli_Math')
;	           options(linkage(system));
;	  The first argument is the function to be performed 
;	     (see jmptab).
;	  The second argument is the function argument.
;
;	To Do:
;	
;       Modifications:
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall
        public _pli_Math
	.data
_pli_data equ $
	include framedef.inc
;------------------------------------------------+
;  Unique Stack Data for _pli_Math               |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_Math
loc_fpc equ     frm_loc-4	; Saved fpucw
loc_end equ     frm_loc-4 	; end of local stack
loc_len equ     frm_loc-loc_end	; Length of local stack
frm_siz equ	frm_len+loc_len	; Total stack frame length

	.code			; PL/I Compatible entry code
_pli_code equ $
	byte 20h,08h,12h,15h,09h,30h,00h,00h
; 
;-----------------------------------------------------
;	_pli_Math:  PL/I Math Functions
;-----------------------------------------------------
	byte   '_pli_Math'		; Entry point name
	byte   9			; Length of name
_pli_Math:
	call dword ptr 0[edi]		; Init stack frame
	dd frm_siz			; DSA size
	mov word ptr [ebp-28],81E1h	; Condition prefix flags
	fstcw loc_fpc[ebp]		; Save fpcw
	fldcw word ptr fpmask		; Set new value
	fld   tbyte ptr 12[ebp]		; Load argument
	mov   eax,8[ebp]		; Load function code
;					  (codes are arbitrary)
	jmp  jmptab[eax*4]		; Go perform function
jmptab	equ  $
	dd   offset acos		;  0=ACOS
	dd   offset asin		;  1=ASIN
	dd   offset atan		;  2=ATAN
	dd   offset atand		;  3=ATAND
	dd   offset atanh		;  4=ATANH
	dd   offset cos  		;  5=COS  
	dd   offset cosd 		;  6=COSD 
	dd   offset cosh 		;  7=COSH 
	dd   offset erf  		;  8=ERF  
	dd   offset erfc 		;  9=ERFC 
	dd   offset exp  		; 10=EXP  
	dd   offset log  		; 11=LOG  
	dd   offset log10 		; 12=LOG10 
	dd   offset log2 		; 13=LOG2 
	dd   offset sin  		; 14=SIN 
	dd   offset sind 		; 15=SIND 
	dd   offset sinh 		; 16=SINH 
	dd   offset sqrt 		; 17=SQRT 
	dd   offset tan  		; 18=TAN  
	dd   offset tand 		; 19=TAND
	dd   offset tanh 		; 20=TANH
	dd   offset gamma		; 21=GAMMA
	dd   offset loggamma		; 22=LOGGAMMA
; 
;-----------------------------------------------------
;	Functional Routines
;	Not implemented here:             
;         atan, atand, atanh,
;	  cosh (need e), erfc,
;	  sinh (need e), tanh (need e), gamma, loggama.            
;-----------------------------------------------------

;	Logarithms
;	Compute log2(x).  This is an elementary operation.
log2:	fld1				; Load 1.0
	fxch				; ST(1)<-1.0, ST(0)<-x
	fyl2x				; ST(0)<-log2(x)
	jmp short  retrn
;	Compute loge(x).  This takes advantage of the identity:
;	logb(x) = logk(x)/logk(b), where b is the desired log base
;	and k is any arbitrary log base.  In this case loge(x)=log2(x)/log2(e)
log:	fld1				; Load 1.0 for fyl2x instruction
	fxch				; ST(1)<-1.0, ST(0)<-x
	fyl2x				; ST(0)<-1.0*log2(x)
	fldl2e				; ST(0)<-log2(e), ST(1)<-log2(x)
	fdiv				; ST(0)<-loge(x) [fdivp]
	jmp short  retrn
;	Compute log10(x), see note and comments for log function.
log10:	fld1
	fxch
	fyl2x				; ST(0)<-1.0*log2(x)
	fldl2t				; ST(0)<-log2(10), ST(1)<-log2(x)
	fdiv				; ST(0)<-log10(x) [fdivp]
	jmp short  retrn

; 	Trigonometric Functions
cosd:	fld real10 ptr pi_180		; cos(x) in degrees
	fmul
cos: 	fcos				; cos(x)
	jmp short  retrn
sind:	fld real10 ptr pi_180		; sin(x) in degrees
        fmul
sin:	fsin				; sin(x)
	jmp short  retrn
tand:	fld real10 ptr pi_180		; tan(x) in degrees
        fmul
tan:	fptan				; Partial tan(x) in ST(1), 1.0 in ST(0)
	fstp st(0)			; Pop the FPU stack
	jmp short  retrn

;	Square Root
sqrt:	fsqrt				; ST(0)<-sqrt(x)
	jmp short  retrn
; 
;-----------------------------------------------------
;	Unimplemented Functions
;-----------------------------------------------------
acos:
asin:
atan:
atand:
atanh:
; Hyperbolic functions except ATANH are implemented
; in _pli_Hyper
sinh:
cosh:
tanh:
; ERF and ERFC are implemented in _pli_ERF
erf:
erfc:
gamma:
loggamma:
	jmp short  retrn		; (Just exit for now)
	
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
; 
;-----------------------------------------------------
;	EXP Adapted from ldexpl.c in GlibC
;	Original comments follow.
;/*
; * Written by J.T. Conklin <jtc@netbsd.org>.
; * Public domain.
; *
; * Adapted for `long double' by Ulrich Drepper <drepper@cygnus.com>.
; */
;
;/*
; * The 8087 method for the exponential function is to calculate
; *   exp(x) = 2^(x log2(e))
; * after separating integer and fractional parts
; *   x log2(e) = i + f, |f| <= .5
; * 2^i is immediate but f needs to be precise for long double accuracy.
; * Suppress range reduction error in computing f by the following.
; * Separate x into integer and fractional parts
; *   x = xi + xf, |xf| <= .5
; * Separate log2(e) into the sum of an exact number c0 and small part c1.
; *   c0 + c1 = log2(e) to extra precision
; * Then
; *   f = (c0 xi - i) + c0 xf + c1 x
; * where c0 xi is exact and so also is (c0 xi - i).
; * -- moshier@na-net.ornl.gov
; */
;-----------------------------------------------------
exp:
	fxam				; Check for NaN or +-Inf
	fnstsw	ax
	mov	dh,45h
	and	dh,ah			; Mask CC
	cmp	dh,05h			; C2-C0
	je short expinf			; C2=C0='1'b: Infinity
	fldl2e				; Load log2(e)
	fmul	st,st(1)		; x * log2(e)
	frndint				; int(x * log2(e)
	fld	st(1)			; Get 'x' again
	frndint				; Compute xi
	fld	st(1)
	fld	tbyte ptr c0
	fld	st(2)			; xi
	fmul	st,st(1)		; c0 * xi
	fsubrp	st(2),st		; f = (c0 * xi) - i
	fld	st(4)			; x
	fsub	st,st(3)		; xf = x - xi
	fmulp	st(1),st		; c0 * xf
	faddp	st(1),st		; f = f + (c0 * xf)
	fld	tbyte ptr c1
	fmul	st,st(4)		; c1 * x
	faddp 	st(1),st		; f = f + (c1 * x)
	f2xm1				; 2**(fract(x * log2(e)))-1
	fld1
	faddp	st(1),st		; 2**(fract(x * log2(e)))
	fstp	st(1)
	fscale
	fstp	st(1)
	fstp	st(1)
	jmp short  retrn		; Exit
expinf:					; Input was +-Infinity
	test	eax,200h		; Test sign
	jz  short  retrn		; positive
	fstp	st			; Pop input value
	fldz				; Set result to zero
	jmp short  retrn		; Exit

	.data
;	Hexadecimal value of 2*PI/360 [PI/180] (1.7453292520E-0002)
;	used to convert degrees to radians.
pi_180	byte	0AEh,0C8h,0E9h,094h,012h,035h,0FAh,08Eh,0F9h,03Fh
;	Constants used by EXP
c0	db	000h,000h,000h,000h,000h,000h,0AAh,0B8h,0FFh,03Fh
c1	byte	020h,0FAh,0EEh,0C2h,05Fh,070h,0A5h,0ECh,0EDh,03Fh

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


