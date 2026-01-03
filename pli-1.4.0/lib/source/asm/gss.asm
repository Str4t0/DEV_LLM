;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;       ***** Warning -- internal code, not for general use *****
;
;	_pli_GSS - PL/I runtime support routines
;       Version 0.1 Alpha -- Oct, 2003
;       Copyright Peter Flass
;       _pli_GSS:   Acquire temporary stack storage
;                   of variable length.
;
;       parameters:
;         EAX contains the length of storage required
;       returns:
;         Stack storage of size ( [EAX]+4 ) rounded up
;         is obtained.  [EAX]+4 is stored at area+0.
;         The address of the area is returned in EAX
;	  EAX and EDI are destroyed by this procedure.
;
;       This is non-PL/I compatible entry and linkage.
;	This code uses only EAX and EDI, so the caller 
;	saves no registers.
;
;       dependencies: none (Intel calling sequence)
;
;	modifications:
;	  2004-11-04 cleaned up and tested
;
;-------------------------------------------------------
	.486P
	.model flat,syscall
        public _pli_GSS

	.code
_pli_code equ $
; 
;-----------------------------------------------------
;	_pli_GSS:  Get stack storage
;-----------------------------------------------------
	db   '_pli_GSS' ; Entry point name
	db   8 		; Length of name
_pli_GSS:
	pop  edi	; Pop return address
	cmp  eax,0	; Make sure length is positive
	jnl  ispos	; Okay
	sub  eax,eax	; Otherwise make it zero
ispos:
	add  eax,7	; Round up to dword+4          
	and  eax,0fffffffCh
	sub  esp,eax	; Get stack
; NOTE: Now use the first few bytes to save registers and do stack probes
	mov  0[esp],eax ; Save length
	lea  eax,4[esp] ; Point to new stack data
	push edi	; Restore return address
	ret		; Exit
 	end
