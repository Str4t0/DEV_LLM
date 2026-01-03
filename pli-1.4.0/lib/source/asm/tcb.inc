; 
;----------------------------------------------------+
;	PL/I Task Control Block(TCB) definition      |
;----------------------------------------------------+
;	(a few equates in areas not completely defined here)
TIB_pTib2	equ	0Ch	; -> TIB2 in TIB
TIB2_ulTid	equ	00h	; Thread ID in TIB2
TIB2_ulPri	equ	04h	; Thread priority in TIB2
;
TCB_pEvent	equ	0	; Addr(event)
TCB_status 	equ	4	; Completion status
TCB_TID      	equ 	8  	; Thread ID     
TCB_stack    	equ 	12 	; Stack base    
TCB_priority 	equ 	16 	; Priority      
TCB_flags    	equ 	20 	; Flag word     
;		80h = Major Task TCB
TCB_entry	equ	24 	; Limited entry 
TCB_arg   	equ	28 	; Argument      
TCB_exit	equ	32 	; Exit address  
TCB_next      	equ 	40 	; Addr(next_TCB)      
TCB_child    	equ 	44 	; Addr(first_child_TCB)
TCB_sib       	equ 	48 	; Addr(next_sibling_TCB)      
TCB_parent   	equ 	52 	; Addr(parent_TCB) 
TCB_pComplete	equ	56	; Addr(completion event)
