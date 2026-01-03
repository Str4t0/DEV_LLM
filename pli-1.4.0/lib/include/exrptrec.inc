 /********************************************************************/
 /*                                                                  */
 /*      Module:        OS/2 Exception Report Record                 */
 /*      Version:       1.0                                          */
 /*      Date:          Jun, 2002                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the OS/2 Exception Report Record   */
 /*                     Data Structure.                              */
 /*                                                                  */
 /*      OS/2 passes the address of the Exception Report Record      */
 /*      to the exception handler when a hardware or software        */
 /*      exception occurs.  The PL/I Exception Handler               */
 /*      (_pli_Trap) directly handles some exceptions and builds     */
 /*      an Interrupt Control Block (IRCB) on the stack containing,  */
 /*      among other information, the address of the Exception       */
 /*      Report Record, and calls _pli_Cond, the PL/I condition      */
 /*      handler interface.                                          */
 /*                                                                  */
 /*      Dependencies: OS/2 Dependent                                */
 /*                    The Context structure is also Intel dependent.*/
 /*                                                                  */
 /*      To Do:                                                      */
 /*        C 'ULONG' data should be declared 'UNSIGNED' when the     */
 /*        compiler supports this attribute.                         */
 /*                                                                  */
 /*      Modifications:                                              */
 /*          2009-10-07: Expand context of 'ctx_env'.            0.8c*/
 /*                                                                  */
 /********************************************************************/

 dcl   1 ExceptionReportRecord    based,
         5 ExceptionNum           fixed bin(31), /* Except num    +00*/
         5 fHandlerFlags          fixed bin(31), /* Handler Flags +04*/
         5 pExceptionReportRecord ptr,           /* ->Nested Excpt+08*/
         5 ExceptionAddress       ptr,           /* ->Except addr +0C*/
         5 cParameters            fixed bin(31), /* Size of Excpt +10*/
         5 ExceptionInfo       (4)fixed bin(31), /* Except Spec. P+14*/
         5 EndExceptionReportRecord char(0);     /* End of structu+24*/

 dcl   1 ContextRecord            based,
         5 ctx_flags              bit(32),       /*               +00*/
         5 ctx_env,                              /*               +04*/
           /* This is the definition of the x87 FPU state image      */
           10 ctx_fpcw            bit(16),       /* Ctl word      +04*/
           10 fil1                char(2),       /*               +06*/
           10 ctx_fpsw            bit(16),       /* Status word   +08*/
           10 fil2                char(2),       /*               +0A*/
           10 ctx_tag          (8)bit(2),        /* Tag word      +0C*/
           10 fil3                char(2),       /*               +0E*/
           10 ctx_ip              fixed bin(31), /* Instr ptr off +10*/
           10 ctx_ipsel           fixed bin(15), /* Instr ptr sel +14*/
           10 ctx_opcode          bit(16),       /* Opcode        +16*/
           10 ctx_op              fixed bin(31), /* Op'nd ptr off +18*/
           10 ctx_opsel           fixed bin(15), /* Op'nd ptr sel +14*/
           10 fil4                char(2),       /*               +16*/
         5 ctx_stack           (8)char(10),      /*               +20*/
         5 ctx_SegGs              fixed bin(31), /*               +70*/
         5 ctx_SegFs              fixed bin(31), /*               +74*/
         5 ctx_SegEs              fixed bin(31), /*               +78*/
         5 ctx_SegDs              fixed bin(31), /*               +7C*/
         5 ctx_RegEdi             fixed bin(31), /*               +80*/
         5 ctx_RegEsi             fixed bin(31), /*               +84*/
         5 ctx_RegEax             fixed bin(31), /*               +88*/
         5 ctx_RegEbx             fixed bin(31), /*               +8C*/
         5 ctx_RegEcx             fixed bin(31), /*               +90*/
         5 ctx_RegEdx             fixed bin(31), /*               +94*/
         5 ctx_RegEbp             fixed bin(31), /*               +98*/
         5 ctx_RegEip             fixed bin(31), /*               +9C*/
         5 ctx_SegCs              fixed bin(31), /*               +A0*/
         5 ctx_EFlags             fixed bin(31), /*               +A4*/
         5 ctx_RegEsp             fixed bin(31), /*               +A8*/
         5 ctx_SegSs              fixed bin(31), /*               +AC*/
         5 EndContextRecord       char(0);       /*               +B0*/
