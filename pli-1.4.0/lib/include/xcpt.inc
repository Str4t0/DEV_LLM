 /********************************************************************/
 /*           Iron Spring PL/I Runtime Library Version 0.5           */
 /*              Distributed under the Gnu LGPL License              */
 /*                                                                  */
 /*      Module:        XCPT                                         */
 /*      Version:       1.0                                          */
 /*      Date:          Aug, 2007                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Definition of OS/2 system exception codes    */
 /*                     and descriptions.                            */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl     os2_xcpt_code   (30)char(4)   static         init(
         '80000001'x,   '80010001'x,   'C0000005'x,   'C000009B'x,
         'C0000095'x,   'C0000097'x,   'C000001C'x,   'C000009D'x,
         'C000009C'x,   'C0000098'x,   'C000009A'x,   'C0000094'x,
         'C0000096'x,   'C0000099'x,   'C000009E'x,   'C000009F'x,
         'C00000A0'x,   'C0000006'x,   'C0010001'x,   'C0010002'x,
         'C0000024'x,   'C0000025'x,   'C000001D'x,   'C0000093'x,
         'C0000026'x,   'C0000027'x,   'C0000028'x,   'C0010003'x,
         'FFFFFFFF'x );

 dcl     os2_xcpt_name   (30)char(30)  static varying init(
         'XCPT_GUARD_PAGE_VIOLATION',
         'XCPT_UNABLE_TO_GROW_STACK',
         'XCPT_ACCESS_VIOLATION',
         'XCPT_INTEGER_DIVIDE_BY_ZERO',
         'XCPT_FLOAT_DIVIDE_BY_ZERO',
         'XCPT_FLOAT_INVALID_OPERATION',
         'XCPT_ILLEGAL_INSTRUCTION',
         'XCPT_PRIVILEGED_INSTRUCTION',
         'XCPT_INTEGER_OVERFLOW',
         'XCPT_FLOAT_OVERFLOW',
         'XCPT_FLOAT_UNDERFLOW',
         'XCPT_FLOAT_DENORMAL_OPERAND',
         'XCPT_FLOAT_INEXACT_RESULT',
         'XCPT_FLOAT_STACK_CHECK',
         'XCPT_DATATYPE_MISALIGNMENT',
         'XCPT_BREAKPOINT',
         'XCPT_SINGLE_STEP',
         'XCPT_IN_PAGE_ERROR',
         'XCPT_PROCESS_TERMINATE',
         'XCPT_ASYNC_PROCESS_TERMINATE',
         'XCPT_NONCONTINUABLE_EXCEPTION',
         'XCPT_INVALID_DISPOSITION',
         'XCPT_INVALID_LOCK_SEQUENCE',
         'XCPT_ARRAY_BOUNDS_EXCEEDED',
         'XCPT_UNWIND',
         'XCPT_BAD_STACK',
         'XCPT_INVALID_UNWIND_TARGET',
         'XCPT_SIGNAL',
         'XCPT_UNKNOWN' );
