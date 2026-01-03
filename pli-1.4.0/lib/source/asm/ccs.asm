;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_CCS - PL/I runtime support routines
;       Version 0.1 Alpha -- May, 2002
;       Copyright Peter Flass
;
;       This module is a generalized character-string
;       compare.
;
;       It (logically) pads the shorter argument with blanks
;       when comparing arguments of unequal length.
;
; To Do:	This could probably be rewritten in PL/I to
;		call a possible COMPARE BIF, but this version
;		should do for now.
;
; Called from:	Address stored in PGT at entry #46         
;       
;       Arguments:
;         EBP+8   (param 1) address of first argument string
;         EBP+12  (param 2) length  "   "     "         "
;         EBP+16  (param 3) address of second argument string
;         EBP+20  (param 4) length  "   "     "         "
;	
;       Returns:
;          -1 if first argument is less than second argument	
;           0 if arguments are equal
;           1 if first argument is greater than second argument	
;	
;       Modifications:	
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall
        public _pli_CCS

	include framedef.inc	; Standard PL/I stack frame
;------------------------------------------------+
;  Unique Stack Data for _pli_CCS                |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_CCS
saveecx equ     frm_loc-4	; -4 Saved length
loc_end equ	frm_loc-4	; End of locals
loc_len equ	frm_loc-loc_end	;                          20050803
frm_siz equ	frm_len+loc_len	; Total stack frame length 20050803

        .data
_pli_data equ $

	.code			; PL/I Compatible entry code
_pli_code equ $
	db 20h,02h,05h,14h,14h,30h,00h,00h
	db '_pli_CCS'
	db 8
_pli_CCS:
	call dword ptr 0[edi]
	dd frm_siz			; DSA size          20031007
	mov word ptr [ebp-28],81E1h	; Condition prefix flags 20091202
        mov ecx,dword ptr 12[ebp]	; Load first arg length
	cmp ecx,dword ptr 20[ebp]	; Compare to second arg length
	jle lenset			; First arg length less
	mov ecx,dword ptr 20[ebp]	; Second arg length less
lenset:
	mov saveecx[ebp],ecx		; Save shorter length
	test ecx,ecx			; Zero-length string?
	jz  zerolen			; yes, skip compare
	mov esi,dword ptr 8[ebp]	; Load first arg address
	mov edi,dword ptr 16[ebp]	; Load second arg address
	repe cmpsb			; compare strings	20050803
	jb  isless			; First string less	20050803
	ja  ismore			; First string greater	20050803
zerolen:
;-------------------------------------------
; control gets here if the strings are
; equal for the length of the shorter
; string (or if the shorter is zero length)
;-------------------------------------------
	mov ebx,0			; Clear swapped flag		20050803
	mov edi,dword ptr 8[ebp]	; Assume first arg is longer
        mov ecx,dword ptr 12[ebp]	; Load first arg length
	sub ecx,dword ptr 20[ebp]	; Subtract second arg length
	jg  long1			; First arg longer
	mov ebx,1			; Set swapped flag		20050803
	mov edi,dword ptr 16[ebp]	; Otherwise second arg longer
	neg ecx
long1:
	test ecx,ecx			; Test for string lengths equal
	je   isequal			; yes, equal compare
	add edi,saveecx[ebp]		; Skip characters compared	20050803
	mov byte ptr al,' '
	repe scasb			; Longer string must be all blanks 50803
	ja  isless1			; Longer string < blanks	20050803
	jb  ismore1			; Longer string > blanks	20050803
isequal:
	mov eax,0			; Arguments equal
	jmp return			; exit (wasm)
isless1:
 	cmp  ebx,0			; Which arg did we look at?
	je   isless			; first
	jmp  ismore			; second
ismore1:
 	cmp  ebx,0
	je   ismore
	jmp  isless
;----------------------------------
;	Return to caller
;----------------------------------
isless: mov eax,-1			; First arg < Second arg
	jmp return			; (wasm)
ismore: mov eax,1			; First arg > Second arg
return:					; (wasm)
	mov ebx,dword ptr [ebp-12]	;			20091202
	mov esi,dword ptr [ebp-8]	;			20091202
	mov edi,dword ptr [ebp-4]	;			20091202
	leave
	ret

_pli_endc equ $
	.data
	org _pli_data+00h
_pli_endd equ $
	end
