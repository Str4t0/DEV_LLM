; 
;----------------------------------------------------+
;       PL/I Stack Frame Definition                  |
;----------------------------------------------------+
frm_ebp  equ      0      ; Previous caller's EBP    20040802
frm_edi  equ     -4      ; Caller's EDI
frm_esi  equ     -8      ; Caller's ESI
frm_ebx  equ     -12     ; Caller's EBX
frm_epa  equ     -16     ; Called Entry point address
frm_stt  equ     -20     ; A(Statement number table)
frm_chc  equ     -24     ; ONCB chain
frm_msk  equ     -26     ; Condition mask (2 bytes)
frm_argc equ     -27     ; Argument count              1.3.2     
frm_epi  equ     -28     ; Entry point id
frm_bos  equ     -32     ; Current permanent BOS
frm_len  equ      32     ; Size of frame

