;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_Start - PL/I runtime support routines
;       Linux version 0.8d -- Mar 2010 
;       Copyright Peter Flass
;
;	PLISTART is statically linked with the user's .EXE.
;	It's function is to pass the address of the Global
;	Data Structure to _pli_Init, which performs the
;	actual initialization.
;
;	To Do:
;	  . Get thread local storage for addr(TDA).
;	  . Add country info.
;	
;       Modifications:
;	  2011-03-29 - WXTERN for ISAM                           0.9.10
;	  2011-03-29 - finally fix WXTERN problem with jwasm.     0.9.2
;	  2010-11-12 - Change 'TDA' to 'TCB'.
;         2008-10-01 - Fix get and put entry variables in gbl  20081001
;                      so that get and put get condition chain 20081001
;         2008-05-21 - Fix startup logic for DLLs	       20080521
;	  2004-06-09 - Add 'maj_task_TDA'
;	
;-------------------------------------------------------
	.486P 
	.model flat,syscall
        public _pli_Start
        public main                     ; Linux
;DGROUP	group  DATA32			;		       20080521

	.code
_pli_code equ $
	extern _pli_Init:near
	extern _pli_Main:near
 	extern _pli_IIC:near
 	extern _pli_Tabs:near 		;			  0.9.2
;	WXTERNs for GET and PUT routines
	extern _pli_Get(_pli_IIC):near
	extern _pli_Put(_pli_IIC):near 
	extern _pli_ISAM(_pli_IIC):near ;                        0.9.10
	extern _start(_pli_IIC):near    ;                         0.9.2
; 
;-----------------------------------------------------
;	_pli_Start:  Initialize PL/I MAIN procedure
;-----------------------------------------------------
	byte   '_pli_Start'		; Entry point name
	byte   10			; Length of name
main:					; Linux
_pli_Start:
;	This code fixes up unresolved weak symbols for ELF.
;	An unresolved symbol is left at zero, so this code
;	fixes up the addresses to point at the error routine.
	cmp  gbl_get_ep,0		; Check for unresolved 20100301
	jne  $1				;		       20100301
	mov  gbl_get_ep,offset _pli_IIC	;		       20100301
$1:	
	cmp  gbl_put_ep,0		; Check for unresolved	   20100301
	jne  $2				;			   20100301
	mov  gbl_put_ep,offset _pli_IIC	;			   20100301
$2:					;			   20100301	
	cmp  gbl_isam_ep,0		; Check for unresolved	     0.9.10
	jne  $3				;			     0.9.10
	mov  gbl_isam_ep,offset _pli_IIC;			     0.9.10
$3:					;			     0.9.10	
	lea  eax,_pli_global_data
	jmp  _pli_Init

	.data
_pli_data equ $
;
;------------------------------------------------+
;	Global Data Area                         |
;------------------------------------------------+
	align	4
_pli_global_data equ $
gbl_data_size	dword	gbl_data_len		; Length of global data
gbl_return_code	dword	0			; Return Code
gbl_main_ep     dword   _pli_Main               ; Address of MAIN       20080521
		dword	0			; (second word of entry)20080521
gbl_get_ep	dword	_pli_Get		; Address of GET routine
		dword	0			; (second word of entry)
gbl_put_ep	dword	_pli_Put		; Address of PUT routine
		dword	0			; (second word of entry)
gbl_ISAM_ep	dword	_pli_ISAM		; Address of ISAM         0.9.10
		dword	0			; (second word of entry)  0.9.10
gbl_User1	dword	0			; User field 1
gbl_User2	dword	0			; User Field 2
gbl_TCB_anchor	dword   maj_task_TCB		; addr(major_task_TCB)	20100301
gbl_alloc_cnt	dword   0			; Allocation count
                dword   0           		; Unused             	   0.9.2
gbl_sysid_addr	dword	0			; Address of system id	20100301
gbl_start_addr	dword	offset _start		; Weak addr(_start)	20100301
;------- to add ----------------------------------------------------------------
;		Add country info?
;-------------------------------------------------------------------------------
		dword	7 DUP(0)		; (reserved, for now)
gbl_data_len	equ	$-_pli_global_data	; Area length
;		Expansion for _pli_global_data goes here
;
;-------------------------------------------------------------------------------
; NOTE: The following definition needs to be kept in sync
;       with the PL/I structure 'tcb.inc'
;-------------------------------------------------------------------------------
maj_task_TCB	equ    $        		; Major task TCB	20101112
		dword  0                    	; addr(event)		20101223
		dword  0			; status                +04
TCB_tid		dword  0			; TID                   +08
TCB_stack	dword  0			; Stack base            +0C
TCB_priority	dword  0			; Thread priority       +10
TCB_flags	dword  000000C0h		; Initial thread + Task +14
		dword  10 DUP(0)		; Chain                 +18
		dword  maj_task_completion	; addr(event)		+40
		dword  3 DUP(0)			;			+44
		
maj_task_completion equ $			; Completion event	20101223
		dword  0			;			+00
		dword  0			;			+04
		dword  0			;			+08
		dword  0			;			+0C

	.stack 100000		

 	end _pli_Start
 
