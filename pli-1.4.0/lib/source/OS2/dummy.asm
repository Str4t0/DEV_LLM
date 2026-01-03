;-------------------------------------------------------
;	Iron Spring PL/I Runtime Library Version 0.6
;	   Distributed under the Gnu LGPL License
;
;	_pli_Start (dummy) - PL/I runtime support routines
;       Version 0.5 Alpha -- May, 2008
;       Copyright Peter Flass
;
;	All PL/I modules reference _pli_Start, which is
;	the startup code linked with the main procedure.
;	This is a dummy module which defines _pli_Start
;	in order to link the runtime DLL.
;	
;	*** This module should never be used ***
;
;
;	To Do:
;	  . Probably library procedures should not reference
;	    _pli_Start, which would eliminate the need for
;	    this module.
;	
;       Modifications:
;	
;-------------------------------------------------------
	.486P
	.model flat,syscall
	.code
_pli_code equ $
	public _pli_Start
_pli_Start:
	int 5			; Anything here...
	end
