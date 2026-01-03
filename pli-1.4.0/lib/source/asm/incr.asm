;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_INC - PL/I runtime support routines
;       Version 0.1 Alpha -- Sep, 2007
;       Copyright Peter Flass
;
;       This module increments a dword in storage atomically
;	using the x86 CMPXCHG instruction.
;
;	Requires a 486 processor or higher.
;
;	This procedure doesn't save any registers.
;	PL/I will save ECX and EDX if used.  The call
;	destroys ESI, EDI, and EAX.
;
; Calling Sequence:
;	DCL inc ENTRY(PTR) returns(PTR)
;	        OPTIONS(ASM LINKAGE(SYSTEM))
;		EXT( '_pli_INC' );
;	DCL  dword   fixed bin(31) static;
;	DCL  new_val fixed bin(31);
;	new_val = inc( addr(dword) );
;
;	The dword 'dword' will be incremented by one
;	and the updated value returned.
;
; To Do:
;       
; Arguments:
;         EBP+8   Address of dword to increment
;	
; Modifications:	
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall
        public _pli_INC

	include framedef.inc	; Standard PL/I stack frame
;------------------------------------------------+
;  Unique Stack Data for _pli_INC                |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_INC
loc_end equ	frm_loc		; End of locals
loc_len equ	frm_loc-loc_end	;
frm_siz equ	frm_len+loc_len	; Total stack frame length

        .data
_pli_data equ $

	.code			; PL/I Compatible entry code
_pli_code equ $
	db 20h,07h,09h,21h,12h,00h,00h,00h
	db '_pli_INC'
	db 8
_pli_INC:
	call dword ptr 0[edi]
	dd frm_siz			; DSA size          20031007
	mov word ptr [ebp-28],81E1h	; Condition prefix flags

	mov ecx,dword ptr 8[ebp]	; Load address of 'dword'
	mov eax,dword ptr 0[ecx]	; Load current value of 'dword'
do_cmpxchg:				; Loop until we're succesful
	mov edx,eax			; Increment by one
	inc edx				;   "
 lock cmpxchg dword ptr 0[ecx],edx	; 'dword'<- updated value if successful
	je  do_cmpxchg			; loop if unsuccessful
;	(Updated value in EAX)

;----------------------------------
;	Return to caller
;----------------------------------
retrn:
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
