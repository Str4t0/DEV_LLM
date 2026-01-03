/*********************************************************************/
/* siginfo.inc - PL/I translation of Linux siginfo structure         */
/*********************************************************************/
dcl    1 siginfo             based,
         5 si_signo          fixed bin(31),      /* Signal number  00*/
         5 si_errno          fixed bin(31),      /* Associated errn04*/
         5 si_code           fixed bin(31),      /* Signal code    08*/
         /* `si_code' values for SIGFPE signal.                      */
         /* FPE_INTDIV: 1 - Integer divide by zero   ZERODIVIDE      */
         /* FPE_INTOVF: 2 - Integer overflow         FIXEDOVERFLOW   */
         /* FPE_FLTDIV: 3 - Floating divide by zero  ZERODIVIDE      */
         /* FPE_FLTOVF: 4 - Floating overflow        OVERFLOW        */
         /* FPE_FLTUND: 5 - Floating underflow       UNDERFLOW       */
         /* FPE_FLTRES: 6 - Floating inexact result  (no error)      */
         /* FPE_FLTINV: 7 - Floating invalid op      ERROR or FOFL   */
         /* FPE_FLTSUB: 8 - Subscript out of range   SUBSCRIPTRANGE  */
         5 si_pid            fixed bin(31),      /* Sending process0C*/
         5 si_uid            fixed bin(31),      /* Sending real ui10*/
         5 si_status         fixed bin(31),      /* Exit value or s18*/
         5 filler            char(104);          /*                24*/
	 
