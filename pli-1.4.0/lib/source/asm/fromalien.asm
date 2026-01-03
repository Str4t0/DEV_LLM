;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_Froma - PL/I runtime support routines
;       Version 0.6 Alpha -- June, 2008
;       Copyright Peter Flass
;	This module implements 'fromalien' linkage.
;
;	PL/I linkage conventions require the address of the 
;	PGT in EDI and the static backchain in ESI.
;
;	This procedure is called at the entry to a 'fromalien'
;	procedure in place of '_pli_SFI' to save the non-PL/I
;	caller's EDI, ESI, and actual return address, and
;	initialize the DSA for the called procedure.
;
;	The called procedure returns here to restore the proper 
;	values and return to the caller.	
;
;	The calling program's ESA is clobbered by this procedure.
;
;	To Do:
;	
;       Modifications:
;	  2025-02-06: frm_argc=0. We don't get arg count from C
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall

	.code
_pli_code equ $
        public _pli_FromA

	extern _pli_PGT:near
	include framedef.inc
; 
;-----------------------------------------------------
;	_pli_FromA:  PL/I 'fromalien' linkage
;-----------------------------------------------------
	db   '_pli_FromA'	; Entry point name
	db   10			; Length of name
_pli_FromA: 
; Stack jiggery-pokery documented by comments as we go
; Build a DSA for the called proc.
; Enter with:
;	0[esp] - return address in called program
;	4[esp] - arguments for called program
;       return_address+0->Required DSA size
;       return_address+4->short (2-byte) jump to real entry
	pop  eax		; Ret address in called prog	0.9.3
	push ebp		; Save calling program's EBP
	mov  ebp,esp		; Load DSA base address
; At this point EBP points to the start of the [callee's] DSA	0.9.3	
	sub  esp,[eax]		; Adjust ESP		        0.9.3
	sub  esp,frm_len	; Point to end of DSA-to-be	0.9.3
; NOTE: Stack probes not required for Linux
; Compiled code has reserved three dwords at the start of the DS0.9.3
; for FROMALIEN procedures to store ESI, EDI, and return address0.9.3	
	mov  [ebp-frm_len-4],esi; Save caller's ESI		0.9.3
 	mov  [ebp-frm_len-8],edi;   and EDI			0.9.3
	mov  esi,[ebp+4]	; Return addr in calling program0.9.3
	mov  [ebp-frm_len-12],esi; Stash in reserved dword	0.9.3
	mov  dword ptr [ebp+4],offset retrn
	add  eax,4		; ->entry addr in called prog	0.9.3			
	
;-------------------------------+
;	Format Stack frame      |
;-------------------------------+
	mov  frm_bos[ebp],esp		; Save BOS address
	lea  edi,_pli_PGT		; Load PGT address 
	mov  frm_edi[ebp],edi		; Set up edi, esi
	mov  dword ptr frm_esi[ebp],0   ; 
	mov  frm_ebx[ebp],ebx		;
	mov  dword ptr frm_epa[ebp],0  	; Entry addr fixed up later          
        mov  dword ptr frm_stt[ebp],0	; Statement number table
        mov  dword ptr frm_argc[ebp],0	; Arg count                  
        mov  dword ptr frm_chc[ebp],0	; Initialize condition handler	    
	mov  dx,word ptr _pli_Def_Cond	; Enabled conditions		    
	mov  frm_msk[ebp],dx		; Condition mask
	mov  byte ptr frm_epi[ebp],0	; Entry point id		        
	cld				; Clear direction flag
; edi loaded with addr(_pli_PGT) above	
	mov  esi,0 			; Clear static backchain
	jmp  eax 			; return to called program

; Return here when called program finishes
; At this point the called program's EBP and return address
; have been popped off the stack, so ESP is 8 greater than it was
; at initial entry.
; EAX may contain a returned value, so it is not used.
retrn:				; Return here
	mov  esi,[esp-frm_len-20]; Return address in calling pro0.9.3
	push esi
; Now esp is only four higher than at initial entry.	
	mov  esi,[esp-frm_len-8] ; Restore caller's ESI and EDI
	mov  edi,[esp-frm_len-12]
	ret			; Return to caller
	
	.data
;
;------------------------------------------------+
;  Default enabled conditions                    |
;------------------------------------------------+
_pli_Def_Cond equ $
		db	0E1h,84h		; Initial condition mask
;                       1... .... .... ....   Conversion
;			.1.. .... .... ....   Fixedoverflow
;			..1. .... .... ....   Overflow
;			...0 .... .... .... NoSize
;			.... 0... .... .... NoStringrange
;			.... .0.. .... .... NoStringsize
;			.... ..0. .... .... NoSubscriptrange
;			.... ...1 .... ....   Underflow
;			.... .... 1... ....   Zerodivide 
;                       .... .... .... .1..   Fromalien           0.9.4
;                       .... .... .... ...1 PL/I Library Function 
;			(remaining bits undefined, should be zero)
;			(see PL/I compiler procedure 'KEYWORD')       
	end
