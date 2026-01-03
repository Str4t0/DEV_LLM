 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Task/Thread Control Block (TCB)         */
 /*      Version:       0.9.2                                        */
 /*      Date:          Nov, 2010                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Contains control information describing      */
 /*                     each PL/I Thread or Task.                    */
 /*                                                                  */
 /*      Length:        80 bytes ('50'x).                            */
 /*                                                                  */
 /*      Where held:    The TCB for the primary thread is held in    */
 /*                     static storage in 'init', linked from 'GBL'. */
 /*                     TCBs for subsequent threads are stored       */
 /*                     in heap storage.                             */
 /*                                                                  */
 /*      Created by:    _pli_BeginThread for started threads.        */
 /*                                                                  */
 /*      Deleted by:    _pli_EndThread on thread termination.        */
 /*								     */
 /*        Fields are initialized in BeginThread(B), or              */
 /*        plitask(P).                                               */
 /*                                                                  */
 /*      Dependencies:                                               */ 
 /*        This also defined as assembler structire TCB.inc          */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /*                                                                  */
 /********************************************************************/

 dcl   1 TCB                 based,
         5 TCB_pEvent        ptr,                 /* ->EVENT var(B)00*/
	 5 TCB_status        fixed bin(31),	  /* STATUS value  04*/
	 5 TCB_tid           fixed bin(31),       /* Thread id  (B)08*/
	 5 TCB_pEREGREC      ptr,                 /* OS/2 only     0C*/
	 5 TCB_priority      fixed bin(31),       /* Priority   (B)10*/
	 5 TCB_flags         bit(32),             /* Flags word (P)14*/
	 /* '8000 0000' - Initial Thread                             */
	 /* '4000 0000' - 1=Task, 0=thread                           */
	 /* '0000 0001' - Task has active children                   */
	 5 TCB_entry	     ptr,		  /* Limited ent(B)18*/
	 5 TCB_arg           fixed bin(31),       /* Caller's ar(B)1C*/
	 5 TCB_Exit	     label,               /* Exit address  20*/
	 5 TCB_next          ptr,                 /* ->Next TCB (B)28*/
	 5 TCB_Stack         ptr,                 /* ->Thread St(B)2C*/
	 5 TCB_Heap          ptr,                 /* ->Thread He(B)30*/
	 /*------- Fields used by 'task' API ------------------------*/
	 5 TCB_child         ptr,                 /* ->First chi(P)34*/
	 5 TCB_sib           ptr,                 /* ->Next sibl(P)38*/
	 5 TCB_parent        ptr,                 /* ->Parent TC(P)3C*/
	 5 TCB_pComplete     ptr,		  /* ->Compl Eve(P)40*/
	 /*-------                           ------------------------*/
	 5 TCB_pPRV          ptr,		  /* ->PRV      (P)44*/
	 5 TCB_trap_DSA      ptr,                 /* Bailout       48*/
	 5 fil               char(4),             /* (reserved)    4C*/
         5 TCB_end           char(0);       /* End of TCB          50*/
	 
