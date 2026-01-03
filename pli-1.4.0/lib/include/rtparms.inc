 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Runtime Parms                           */
 /*      Version:       0.8d                                         */
 /*      Date:          Mar, 2010                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Definition of runtime parms for PL/I programs*/
 /*                                                                  */
 /*      Where held:    Static data of _pli_Init                     */
 /*                                                                  */
 /*      Where used:    Heap/Stack sizes used by memory allocator.   */
 /*                                                                  */
 /*      Created:       Defaults in _pli_Init                        */
 /*                     Updated from command-line data by _pli_GCL   */
 /*                     at start of program execution.               */
 /*                                                                  */
 /*      Dependencies:                                               */
 /*                     Also mapped in 'init' as '_pli_runtime_parms'*/
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*	     2010-03-01: Ver 0.8d - Replace pCmdl,lCmdl with     0.8d*/
 /*			 address of locator/descriptor to support0.8d*/
 /*			 Linux port.  				 0.8d*/
 /*          2007-03-20: Ver 1.2 - add pCmdl, lCmdl, filler.         */
 /*                                                                  */
 /********************************************************************/

 dcl   1 PLI_RTParms         based,
         5 rtp_HeapSize      fixed bin(31),      /* Initial Heap size*/
         5 rtp_T1StackSize   fixed bin(31),      /* Thrd 1 stack size*/
         5 rtp_TnStackSize   fixed bin(31),      /* Thrd n stack size*/
         5 rtp_pCmd          ptr,                /* ->Loc/Desc   0.8d*/
         5 fil               char(112),          /* (reserved)   0.8d*/
         /*  Currency symbol?                                        */
         /*  Heap increment?                                         */
         /*  Prefix option?                                          */
         /*  Mode (Fullscreen,windowed,PM - this is a thread attr.)  */
         5 rtp_end           char(0);            /* End of Structure */

