;*************************************************
;    sigaction.inc 
;    partial assembler translation of sigaction.h
;*************************************************

segregs	equ     0	; gs, fs, es, ds
_edi	equ	32
_esi	equ     36
_ebp	equ	40
_ebx	equ	44
_edx	equ	48
_ecx	equ	52
_eax	equ	56
_trapno	equ	60
_err	equ	64
_eip	equ	68
_cs	equ	72
_eflags	equ	76
_esp_at_signal	equ	80
_ss		equ	84
_pfpstate	equ	88
_oldmask	equ	92
_cr2		equ	96
