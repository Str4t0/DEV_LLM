;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.5
;	   Distributed under the Gnu LGPL License
;
;	_pli_Init - PL/I runtime support routines
;       Linux Version 0.8d -- Mar 2010
;       Copyright Peter Flass
;       This module contains most of the OS dependencies
;       Compiler-generated code should be OS independent.
;
;	_pli_Init is the second stage of PL/I initialization.
;	It is called by _pli_Start, which is statically linked
;	with the user's .EXE.  It is passed the address of
;	the Global Data Structure in EAX, which it stores in
;	entry 127 in the PGT so that the Global Data can be
;	referenced both from the .EXE and the PL/I DLL if
;	the DLL is used instead of static linkage.
;
;	To Do: 
;	  . See note on parm analyzer.
;	    and definition of TIB.
;	
;       Modifications:
;         2025-01-30 - Add argument count to DSA               1.3.2  
;         2020-10-03 - Add trace table for diagnostics       0.9.10d
;         2016-08-26 - argc/argv/envp; various fixes          0.9.10
;	  2012-08-17 - fix environment problem with libc       0.9.4
;         2012-01-04 - Examine option byte for CICSMAIN.       0.9.3
;	  2010-03-01 - Fix parm analyzer depending on whether   0.8d
;		       or not libc is linked.			0.8d
;	  2008-06-04 - Fix stack frames for 'fromalien'		0.6a
;	  2008-05-21 - Fix startup logic for DLLs, add 'gbl.inc'
;	  2007-11-08 - @00003 - fix PLITABS linkage.
;	  2007-06-09 - Fix for problem with DosGetInfoBlocks
;	  2007-03-20 - New version of 'GCL'.
;	  2006-10-17 - Fix return of pliretc()
;	  2006-09-27 - Reload addr(PGT) at 'exit' in case
;			exit is jumped to out of SIG.
;	  2006-08-08 - Fix invalid branch in 'probe'
;	  2006-02-01 - Fix 'fpmask' for x87 setup
;	  2005-05-09 - zero entry point id in DSA
;	  2005-01-05 - add _pli_OTH (OTHERWISE) handler
;	  2004-12-22 - Add addr(ATTN_ONCB) after ExceptionRegistrationRecord
;	  2004-06-09 - Add initialization for major task TID
;	  2004-05-26 - DosSetSignalExceptionFocus
;	  2004-05-24 - Set initial FPU control word
;	  2004-05-11 - Fix Error trapping problem
;	  2003-12-14 - Rename _pli_Init, set up so that the
;			library can run as a DLL.
;	  2003-07-03 - Add heap storage allocation
;	  2002-07-18 - Create _pli_End EXTERNAL label variable
;	  2002-06-25 - Save A(PGT) in my stack frame to make _pli_Start
;			look like a PL/I program for stack trace.
;	  2002-06-04 - Error in SFI
;	  2002-04-26 - Add beginnings of trap handler
;         2001-03-02 - Add Parm scanner
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall

	.code
_pli_code equ $
        public _pli_Init	;				20031214
	public _pli_PGT
	public _pli_Def_Cond
        public _pli_argc        ;                               20160826
        public _pli_Ttbl       ;                                0.9.10d

; Entries in PGT -----------------------
 	extern _pli_IIC:near		; Invalid call (compiler error)
 	extern _pli_GSS:near		; (04) Get Stack Storage
 	extern _pli_GHS:near		; (06) Get Heap Storage
 	extern _pli_FHS:near		; (07) Free Heap Storage
	extern _pli_Sig:near		; (16) SIGNAL Condition
 	extern _pli_OnRev:near		; (17) ON/REVERT Condition
 	extern _pli_OTH:near		; (20) Default OTHERWISE handler20050105
 	extern _pli_IOR:near		; (30) I/O Router
 	extern _pli_CCS:near		; (46) Character String compare

	extern _pli_GCL:near		; Parm analyzer
	extern _pli_SigInit:near	; 			Linux

	include gbl.inc		; PL/I Global data		20080521
	include tcb.inc		; Task Control Block (TCB)	20101215
	include framedef.inc
;------------------------------------------------+
;  Unique Stack Data for _pli_Init               |
;------------------------------------------------+
frm_loc equ     frm_bos		; Start of locals for _pli_Init
loc_edi equ     frm_loc-4	; Caller's EDI                  20020625
ERRHnd  equ     frm_loc-8	; -> Error handler
ERRPerr equ     frm_loc-12	; -> Previous Exception Rec
ERegRec	equ     frm_loc-12	; Exception Registration Record
EAttnCB equ	frm_loc-16	; addr(ATTENTION_ONCB)		20041222
tib_addr equ	frm_loc-20	; Temporary			20070609
pib_addr equ	frm_loc-24	;				20070609
main_opt equ    frm_loc-25      ; 'MAIN' options byte              0.9.3
saved_fp equ    frm_loc-28	; Callers FPU control              0.9.3          
save_siginfo equ saved_fp       ; For SigInit to save and restore  0.9.3
loc_end equ     frm_loc-640	; end of local stack		   0.9.3
loc_len equ     frm_loc-loc_end	; Length of local stack
; 
;-----------------------------------------------------
;	_pli_Init:  Initialize PL/I MAIN procedure
;-----------------------------------------------------
	db   '_pli_Init'; Entry point name
	db   9		; Length of name
_pli_Init: 
        push ebp		; Save caller's EBP
	mov  ebp,esp		; Save registers
	mov  dword ptr _pli_PGT+GBL*4,eax; Save a(_pli_gbl_data)20031214
;       COMMENT: EBP->argc for Linux...
	sub  esp,frm_len+loc_len; Reserve stack frame
	mov  frm_bos[ebp],esp	; Save BOS address
	mov  loc_edi[ebp],edi	; Save caller's registers	20020625
	mov  frm_esi[ebp],esi   ;   (edi,esi,ebx)
	mov  frm_ebx[ebp],ebx
	mov  dword ptr frm_epa[ebp],offset _pli_Init 
        mov  dword ptr frm_stt[ebp],0		; Statement number table
        mov  dword ptr frm_chc[ebp],0		; Condition handler chain
	mov  ax,word ptr _pli_Def_Cond		; Enabled conditions
	or   ax,0100h		; Indicate 'library'		    0.7c
	mov  frm_msk[ebp],ax	; Condition mask
        mov  edi,offset _pli_PGT; load a(PGT)
	mov  frm_edi[ebp],edi	; Indicate PL/I stack frame 	20020625
	mov  esi,ebp		; Static backchain
	fstcw word ptr saved_fp[ebp]	; Save FPU control word    0.9.3
        fninit          	; Initialize FPU (may be redundant)
	fldcw word ptr fpmask	; Set FPU control word      	20040524
	cld			; Clear direction flag
; 
;-----------------------------------------------------
;	Initialize Global data and Major Task TCB [2004-06-09] 
;-----------------------------------------------------	
	mov  edi,dword ptr _pli_PGT+GBL*4	; addr(_pli_gbl_data)
	mov  esi,gbl_main_ep[edi]               ; addr(MAIN)       0.9.3
	sub  esi,1                              ; ->Name len       0.9.3
	movzx eax,byte ptr 0[esi]               ; ->Name           0.9.3
	sub  esi,eax                            ;                  0.9.3
	sub  esi,1                              ; ->Option byte    0.9.3
	mov  al,0[esi]                          ; Stash option byte0.9.3
	mov  main_opt[ebp],al                   ;                  0.9.3
	mov  gbl_sysid_addr[edi],offset sysid	; addr(sysid string)
	mov  edi,dword ptr gbl_tcb_anchor[edi]	; addr(initial TCB)
	mov  eax,20				; Get tid	20100301
	int  80h				;		20100301
	mov  dword ptr TCB_TID[edi],eax		;		20100301
;	Other fields: Heap addr, stack addr?


;--->	Set edi to point to the PGT throughout the rest of initialization <---
        mov  edi,offset _pli_PGT; load a(PGT)	; Load PGT address
;--->	From this point on, *do not* use edi or esi without saving and restoring <---

; 
;-----------------------------------------------------
;	Initialize Exit address [2002-07-18]        
;-----------------------------------------------------
	mov  edx,dword ptr _pli_PGT+GBL*4	; addr(_pli_gbl_data)
	mov  edx,48[edx]			; GBL_TCB_anchor	20101217
	lea  eax,finish				; 			20100301
	mov  32[edx],eax			; Exit label		20101217
	mov  36[edx],ebp			;			20101217
; 
;-----------------------------------------------------
;	Initialize Trap Handler [2002-04-26]        
;-----------------------------------------------------
	push 0					; Don't restore         0.9.3
	lea  eax,save_siginfo[ebp]		; Where to save         0.9.3
	push eax				;			0.9.3
	call _pli_SigInit			;			LINUX
	add  esp,8				;		     20120113
; 
;-----------------------------------------------------
;	Call Parm Analyzer [Rev Mar 20, 2007]
;	[This will run with _pli_Main's stack and no
;	heap storage.]
;	Linux -- If this program ls linked with libc,
;	libc's _start will have process the command args
;	and passed us (int argc, char *argv[]) like C main().
;	If we're not linked with libc argc will be at ebp+4,
;	argv[0] will be at ebp+8, and addr(envp[0]) at ebp+12
;-----------------------------------------------------
        test byte ptr main_opt[ebp],40h         ; 'CICSMAIN'?    0.9.3
	jnz  cicsmain		                ; yes            0.9.3 
	mov  eax,dword ptr _pli_PGT+GBL*4	; addr(_pli_gbl_data)
; Test to see if we're linked with gcc                           0.9.4	
	cmp  dword ptr gbl_start_addr[eax],0	; Linked with libc?
	je   sysv_entry  			; no             0.9.4
	cmp  dword ptr gbl_start_addr[eax],offset _pli_IIC ;     0.9.2
	je   sysv_entry 			; no             0.9.4
c_entry:					; C calling conve0.9.4
	mov  ecx,dword ptr 8[ebp]		; argc           0.9.4
	mov  ebx,dword ptr 12[ebp]		; addr(argv[0])  0.9.4
        mov  edx,dword ptr 16[ebp]              ; addr(envp[0])  0.9.4
	jmp cmnd_parse				; Command parse  0.9.4
sysv_entry:					; SysV calling co0.9.4
	mov  ecx,4[ebp]				; argc	      20100707
	lea  ebx,8[ebp]				; addr(argv[0])			20091208
        mov  edx,ecx                            ; argc          0.9.10
	shl  edx,2				; times 4       0.9.10
	lea  edx,4[ebx+edx]			; ->envp[0]     0.9.10
cmnd_parse:					; Get command length
        mov  argc,ecx                           ;               0.9.10
        mov  ppargv,ebx                         ;               0.9.10
        mov  ppenv,edx                          ;               0.9.10
	mov  dword ptr _pli_PGT+ENV*4,edx	; Store addr(envp0.9.4		20100707
	push offset _pli_runtime_parms
	push ebx
	mov  al,2		
	call _pli_GCL
	add  esp,8
; This returns the size of storage required for "command line"
	mov eax,dword ptr desc+4		; Load required length
	add eax,7				; Round up
	and eax,0FFFFFFF8h
	sub esp,eax				; Get stack space
 	mov frm_bos[ebp],esp			; Save BOS address		20070320
	mov adata,esp				; Save addr for GCL
	push offset _pli_runtime_parms
	push ebx
	mov  al,2		
	call _pli_GCL
	add  esp,8
; This builds the psuedo command-line on the stack
        mov  edi,offset _pli_PGT; load a(PGT)	; Restore PGT address
	jmp  initio                             ;                  0.9.3
; 
;-----------------------------------------------------
;	Get argc, argv for called main                             0.9.3
;-----------------------------------------------------
cicsmain:					;		   0.9.3
	sub  esp,8				; allocate arg spc 0.9.3
 	mov  frm_bos[ebp],esp			; Save BOS address 0.9.3
	mov  eax,8[ebp]				; Load argc        0.9.3
	mov  0[esp],eax				;		   0.9.3
	mov  eax,12[ebp]			; load *(*argv)    0.9.3
	mov  4[esp],eax				;		   0.9.3
; 
;-----------------------------------------------------
;	No need to allocate heap for Linux 
;-----------------------------------------------------
; 
;-----------------------------------------------------
;	Initialize I/O Router [Jul 31, 2003]
;-----------------------------------------------------
initio:                                         ;                         20100722
 	push 00320000h				; (0,50) = Initialize
 	push esp				; A(code)
 	mov  al,1
 	call _pli_IOR
 	add  esp,8				; pop parms 20031211
	
;-----------------------------------------------------
;	MAIN procedure should not return a value,
;	but allow for one just in case
;-----------------------------------------------------
	sub   esp,12		; Reserve space for returned value
	push  esp		; push A(returned_value)
	push  dword ptr offset _pli_Main_Parm_locdesc
	mov   al,1		; Number of parameters
;				  EDI->PGT (set above)
;				  Should we set ESI (static backchain)?
	mov   esi,dword ptr _pli_PGT+GBL*4 ; Load a(_pli_gbl_data)    20080521
        call  dword ptr gbl_main_ep[esi] ; Call PL/I MAIN procedure   20080521
	add   esp,20		; Pop parameters off stack

;*****************************************************
;	MAIN procedure or normal return from ERROR 
;       returns here
;*****************************************************
finish:	
	mov esp,frm_bos[ebp]

;-----------------------------------------------------
;	Close any open files [Feb 4, 2004]
;-----------------------------------------------------
 	mov  edi,offset _pli_PGT		; reload a(PGT)		20060927
 	push 00330000h				; (0,51) = Terminate
 	push esp				; A(Dummy_IORB)
 	mov  al,1
 	call _pli_IOR
 	add  esp,8				; pop parms

; 
;------------------------------------------+
;	Just as we don't allocate,
;	so don't we free heap
;------------------------------------------+
        test byte ptr main_opt[ebp],40h         ; 'CICSMAIN'?    0.9.3
	jnz  cicsmain_exit		        ; yes            0.9.3 
	mov  ebx,dword ptr _pli_PGT+GBL*4 ; addr(globals)		20070524
	mov  ebx,gbl_return_code[ebx]	; Set task return code		20080521
	mov  eax,252			; SYS_EXIT_GROUP			20100228
	int  80h			; Linux Syscall
; If SYS_EXIT_GROUP isn't supported by this kernel, try SYS_EXIT	
	mov  eax,1			; SYS_EXIT			20100228
	int  80h			; Linux Syscall
;	
;------ For OPTIONS(CICSMAIN) just return to caller		  0.9.3
;
cicsmain_exit:				;			  0.9.3
	lea  eax,save_siginfo[ebp]	; Where to restore        0.9.3
	push eax			;			  0.9.3
	push 0				; Don't save              0.9.3
	call _pli_SigInit		;			  LINUX
	add  esp,8			;		       20120113
	fldcw word ptr saved_fp[ebp]	; Restore FPU control word0.9.3
; restore ebx, esi, edi
	mov  edi,loc_edi[ebp]		; Restore caller's registers	20020625
	mov  esi,frm_esi[ebp]   	;   (edi,esi,ebx)
	mov  ebx,frm_ebx[ebp]
	leave				;			  0.9.3
	ret				; Return to caller	  0.9.3	

	page

;
;-----------------------------------------------------
;	_pli_sfi:  stack frame init at block entry
;       saves:     ebp,ebx,esi,edi  
;	destroys:  ecx,edx
;       untouched: eax
;       does stack probes if size(local_stg)>4k
;-----------------------------------------------------
	db   '_pli_SFI'	; Entry point name
	db   8		; Length of name
_pli_sfi:
	pop  ecx	; restore return address
	push ebp	; [EBP+00]
	mov  ebp,esp	; save stack ptr
	mov  edx,0[ecx] ; load size of locals
	sub  esp,edx	; adjust ESP 
; NOTE: Stack probes not required for Linux	
;-------------------------------+
;	Format Stack frame      | 
;-------------------------------+
	mov  frm_bos[ebp],esp	; Save BOS address
	mov  frm_edi[ebp],edi	; Save caller's registers
	mov  frm_esi[ebp],esi   ;   (edi,esi,ebx)
	mov  frm_ebx[ebp],ebx
        mov  edx,ecx    	; A(local size)
        sub  edx,2     		; A(entry point) 20020620
	mov  frm_epa[ebp],edx 
        mov  dword ptr frm_stt[ebp],0	; Statement number table
        mov  dword ptr frm_chc[ebp],0	; Initialize condition handler	0.6a
        mov byte ptr frm_argc[ebp],al   ; Argument count                1.3.2
	mov  dx,word ptr _pli_Def_Cond	; Enabled conditions		0.6a
	mov  frm_msk[ebp],dx		; Condition mask		0.6a
	mov  byte ptr frm_epi[ebp],0	; Entry point id		20050509
	mov  esi,0[ebp]		; Address of caller's stack frame 	20020604
; NOTE: The caller's ESI should be zero only if this procedure is 
;	called from another language (fromalien).  The condition 
;	handler chain should still be set up by chasing the EBP
;	chain until a PL/I procedure is found.
	cmp  dword ptr ebp,0	; Any backchain?		        0.6a
	je   sfix		; No, skip				0.6a
	mov  edx,frm_chc[esi] 	; Condition handler chain
        mov  frm_chc[ebp],edx
	mov  dx,frm_msk[esi] 	; Condition mask
        mov  frm_msk[ebp],dx
; Copy the address of the statement offset table.  External procedures will
; set this value later                                                   
	mov  edx,frm_stt[esi] 	; Statement offset table               0.9.9
        mov  frm_stt[ebp],edx   ;                                      0.9.9
sfix:				;					0.6a

; Update trace table entry: EBP+EPA                             ; 0.9.10d
        mov  edx,dword ptr _pli_Ttbl                           ; 0.9.10d
        add  edx,8              ; ->next entry                  ; 0.9.10d
        cmp  edx,offset trace_e ; check for wrap                ; 0.9.10d
        jne  trc1               ; no wrap                       ; 0.9.10d
        mov  edx,offset trace_s ; reset ptr                     ; 0.9.10d
trc1:   mov  dword ptr _pli_Ttbl,edx ; Save updated ptr        ; 0.9.10d
        mov  dword ptr 0[edx],ebp ; save ebp                    ; 0.9.10d
        mov  ebx,frm_epa[ebp]                                   ; 0.9.10d
	mov  dword ptr 4[edx],ebx ; save epa                    ; 0.9.10d

	cld			; Clear direction flag
       	add  ecx,4		; skip over size
	jmp  ecx		; return to caller

sysid   dw      5		; Length of sysid field			Linux
	db	'Linux   '	; System ID				Linux
	PAGE

        .data
_pli_data equ $
	align 4
;
;------------------------------------------------+
;	Trace table                              |
;------------------------------------------------+
           db      'trace table     '                   ; 0.9.10d
_pli_Ttbl dd      offset trace_s-8                     ; 0.9.10d
           dd      offset trace_e                       ; 0.9.10d
trace_s    equ     $                                    ; 0.9.10d  
           dd      (40) DUP(0)     ; 20 8-byte trace ent; 0.9.10d
trace_e    equ     $                                    ; 0.9.10d

;
;------------------------------------------------+
;	PL/I Program Global Table (PGT)          |
;	For upward-compatibility, do not move    |
;	or delete entries, or change the calling |
;	sequences.  New entries may be added.    |
;------------------------------------------------+
;             Memory comments, version, etc.
;	      ....|....1....|....2....|....3 
	db   'PL/I 0.9.10d    '		; -56 -  -41
	db   'Copyright Peter Flass,  '	; -40 -  -17
	db   'Oct, 2020	      '		; -16 -   -1

;       Intrinsic Function IDs
SFI	EQU  0          ; Stack Frame Init
GSS	EQU  4		; Get Stack storage				20070320
GHS	EQU  6		; Get Heap storage
FHS	EQU  7		; Free Heap storage
SIG     EQU  16     	; SIGNAL condition
ONR     EQU  17     	; ON/REVERT condition
OTH	EQU  20		; Default OTHERWISE handler			20050105
IOR	EQU  30		; I/O Router
CCS	EQU  46		; Compare character string
TRC     EQU  124        ; addr(trace table)
ENV     EQU  125 	; addr(Linux envp)  ***Linux			20100707
ARG     EQU  126 	; addr(Linux argc)  ***Linux
GBL	EQU  127	; addr(_pli_gbl_data)				20070524
NIF     EQU  128	; Number of entries in table

_pli_PGT equ  $		; PL/I intrinsic routine addresses
	dd   offset _pli_sfi		; 0:	Stack Frame Init
 	dd   offset _pli_IIC		; 1:
 	dd   offset _pli_IIC		; 2:
 	dd   offset _pli_IIC		; 3:
 	dd   offset _pli_GSS		; 4:	Get Stack Storage
 	dd   offset _pli_IIC		; 5:
 	dd   offset _pli_GHS		; 6:	Get Heap Storage
 	dd   offset _pli_FHS		; 7:	Free Heap Storage
 	dd   offset _pli_IIC		; 8:
 	dd   offset _pli_IIC		; 9:
 	dd   offset _pli_IIC		; 10:
 	dd   offset _pli_IIC		; 11:
 	dd   offset _pli_IIC		; 12:
 	dd   offset _pli_IIC		; 13:
 	dd   offset _pli_IIC		; 14:
 	dd   offset _pli_IIC		; 15:
	dd   offset _pli_Sig		; 16:	SIGNAL condition
 	dd   offset _pli_OnRev		; 17:	ON/REVERT condition
 	dd   offset _pli_IIC		; 18:
 	dd   offset _pli_IIC		; 19:   Invalid Instrinsic call   0.9.10d
 	dd   offset _pli_OTH		; 20:   Default OTHERWISE handler 20050105
 	dd   offset _pli_IIC		; 21:
 	dd   offset _pli_IIC		; 22:
 	dd   offset _pli_IIC		; 23:
 	dd   offset _pli_IIC		; 24
 	dd   offset _pli_IIC		; 25:
 	dd   offset _pli_IIC		; 26:
 	dd   offset _pli_IIC		; 27:
 	dd   offset _pli_IIC		; 28:
 	dd   offset _pli_IIC		; 29:
 	dd   offset _pli_IOR		; 30:	I/O Router
 	dd   offset _pli_IIC		; 31:
 	dd   offset _pli_IIC		; 32:
 	dd   offset _pli_IIC		; 33:
 	dd   offset _pli_IIC		; 34:
 	dd   offset _pli_IIC		; 35:
 	dd   offset _pli_IIC		; 36:
 	dd   offset _pli_IIC		; 37:
 	dd   offset _pli_IIC		; 38:
 	dd   offset _pli_IIC		; 39:
 	dd   offset _pli_IIC		; 40:
 	dd   offset _pli_IIC		; 41:
 	dd   offset _pli_IIC		; 42:
 	dd   offset _pli_IIC		; 43:
 	dd   offset _pli_IIC		; 44:
 	dd   offset _pli_IIC		; 45:
 	dd   offset _pli_CCS		; 46:	Compare character string
 	dd   offset _pli_IIC		; 47:
 	dd   offset _pli_IIC		; 48:
 	dd   offset _pli_IIC		; 49:
 	dd   offset _pli_IIC		; 50:
 	dd   offset _pli_IIC		; 51:
 	dd   offset _pli_IIC		; 52:
 	dd   offset _pli_IIC		; 53:
 	dd   offset _pli_IIC		; 54:
 	dd   offset _pli_IIC		; 55:
 	dd   offset _pli_IIC		; 56:
 	dd   offset _pli_IIC		; 57:
 	dd   offset _pli_IIC		; 58:
 	dd   offset _pli_IIC		; 59:
 	dd   offset _pli_IIC		; 60:
 	dd   offset _pli_IIC		; 61:
 	dd   offset _pli_IIC		; 62:
  	dd   offset _pli_IIC		; 63:
;------------------------------------------------ Only 0-63 currently defined
 	dd   offset _pli_IIC		; 64:
 	dd   offset _pli_IIC		; 65:
 	dd   offset _pli_IIC		; 66:
 	dd   offset _pli_IIC		; 67:
 	dd   offset _pli_IIC		; 68:
 	dd   offset _pli_IIC		; 69:
 	dd   offset _pli_IIC		; 70:
 	dd   offset _pli_IIC		; 71:
 	dd   offset _pli_IIC		; 72:
 	dd   offset _pli_IIC		; 73:
 	dd   offset _pli_IIC		; 74:
 	dd   offset _pli_IIC		; 75:
 	dd   offset _pli_IIC		; 76:
 	dd   offset _pli_IIC		; 77:
 	dd   offset _pli_IIC		; 78:
 	dd   offset _pli_IIC		; 79:
 	dd   offset _pli_IIC		; 80:
 	dd   offset _pli_IIC		; 81:
 	dd   offset _pli_IIC		; 82:
 	dd   offset _pli_IIC		; 83:
 	dd   offset _pli_IIC		; 84:
 	dd   offset _pli_IIC		; 85:
 	dd   offset _pli_IIC		; 86:
 	dd   offset _pli_IIC		; 87:
 	dd   offset _pli_IIC		; 88:
 	dd   offset _pli_IIC		; 89:
 	dd   offset _pli_IIC		; 90:
 	dd   offset _pli_IIC		; 91:
 	dd   offset _pli_IIC		; 92:
 	dd   offset _pli_IIC		; 93:
 	dd   offset _pli_IIC		; 94:
 	dd   offset _pli_IIC		; 95:
 	dd   offset _pli_IIC		; 96:
 	dd   offset _pli_IIC		; 97:
 	dd   offset _pli_IIC		; 98:
 	dd   offset _pli_IIC		; 99:
 	dd   offset _pli_IIC		; 100:
 	dd   offset _pli_IIC		; 101:
 	dd   offset _pli_IIC		; 102:
 	dd   offset _pli_IIC		; 103:
 	dd   offset _pli_IIC		; 104:
 	dd   offset _pli_IIC		; 105:
 	dd   offset _pli_IIC		; 106:
 	dd   offset _pli_IIC		; 107:
 	dd   offset _pli_IIC		; 108:
 	dd   offset _pli_IIC		; 109:
 	dd   offset _pli_IIC		; 110:
 	dd   offset _pli_IIC		; 111:
 	dd   offset _pli_IIC		; 112:
 	dd   offset _pli_IIC		; 113:
 	dd   offset _pli_IIC		; 114:
 	dd   offset _pli_IIC		; 115:
 	dd   offset _pli_IIC		; 116:
 	dd   offset _pli_IIC		; 117:
 	dd   offset _pli_IIC		; 118:
 	dd   offset _pli_IIC		; 119:
 	dd   offset _pli_IIC		; 120:
 	dd   offset _pli_IIC		; 121:
 	dd   offset _pli_IIC		; 122:
 	dd   offset _pli_IIC		; 123:
 	dd   offset _pli_Ttbl		; 124: Trace table   0.9.10d
 	dd   0                		; 125: A(envp)
 	dd   0               		; 126: A(argc)
	dd   0				; 127:  _pli_gbl_data
_pli_PGT_end equ $

	PAGE
;
;------------------------------------------------+
;	Parameters for runtime library, etc.     |
;------------------------------------------------+
	align	4
_pli_runtime_parms equ $
;def_heap_size  dd	65536			; Default Heap size - 64K
;def_heap_size  dd	1048576			; Default Heap size - 1MB
def_heap_size   dd	2097152			; Default Heap size - 2MB 20081216
def_t1_stk_size dd	1048576*8		; Stack size for thread 1 - 1MB
def_tn_stk_size dd	1048576*8		; Stack size for thread n - 1MB
rtp_pCmd	dd	_pli_Main_Parm_locdesc	; addr(parm loc/desc)		20100302
		db	112 DUP(0)		; Reserved for add'l parms	20100302		

;------------------------------------------------+
;	Parameter for MAIN procedure             |
;	(NOTE: Can move to DSA)			 |
;------------------------------------------------+
	align	4
_pli_Main_Parm_locdesc equ $			; Locator/Descriptor for Parm
adata	dd	0				;   Parm address
adesc	dd	offset desc			;   Descriptor address
desc	db	11h,0,0,0			;   Varying String Descriptor
	dd	0				;   . Max string length

	align	2
fpmask  db      20h,0Fh				; FPU Control word               20060214
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
;						  Double Extended Precision      20050624
;						  Round toward zero              20050624
;						  #P masked                      20050624
;------------------------------------------------+
;  Default enabled conditions                    |
;------------------------------------------------+
_pli_Def_Cond equ $
		db	0E1h,80h		; Initial condition mask
;                       1... .... .... ....   Conversion
;			.1.. .... .... ....   Fixedoverflow
;			..1. .... .... ....   Overflow
;			...0 .... .... .... NoSize
;			.... 0... .... .... NoStringrange
;			.... .0.. .... .... NoStringsize
;			.... ..0. .... .... NoSubscriptrange
;			.... ...1 .... ....   Underflow
;			.... .... 1... ....   Zerodivide 
;                       .... .... .... ...1 PL/I Library Function 
;			(remaining bits undefined, should be zero)
;			(see PL/I compiler procedure 'KEYWORD') 
      
;------------------------------------------------+               0.9.10
;  argc/argv/envp for pl/i program               |               0.9.10
;------------------------------------------------+               0.9.10
_pli_argc     equ $                              ;               0.9.10
argc          dd  0                              ;               0.9.10
ppargv        dd  0                              ;               0.9.10
ppenv         dd  0                              ;               0.9.10

 	end
