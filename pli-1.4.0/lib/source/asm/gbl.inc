; 
;----------------------------------------------------+
;	PL/I Global Data (GBL)                       |
;----------------------------------------------------+
gbl_data_size   equ	 0	; Length of this area
gbl_return_code equ	 4	; Return code
gbl_main_ep	equ	 8	; Entry point of main
gbl_get_ep	equ	16	; GET entry point
gbl_put_ep	equ	24	; PUT entry point
gbl_ISAM_ep	equ	32	; PUT entry point               0.9.10 
gbl_user1	equ	40	; User field 1
gbl_user2	equ	44	; User field 2
gbl_tcb_anchor	equ	48	; A(major_task_tcb)
gbl_alloc_cnt	equ	52	; Allocation count(?)
gbl_unused1     equ	56	;                                 0.9.2
gbl_sysid_addr	equ	60	; A(system id string)
gbl_start_addr	equ	64	; Weak A(_start)	       20100301
;	(reserved, 28 bytes)


