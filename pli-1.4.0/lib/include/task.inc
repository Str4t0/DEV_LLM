 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Task/Thread Variable (TASK)             */
 /*      Version:       0.9.2                                        */
 /*      Date:          Nov, 2010                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Task variable associated with each PL/I      */
 /*                     task or thread.                              */
 /*                                                                  */
 /*      Length:        24 bytes ('18'x).                            */
 /*                                                                  */
 /*      Where held:    User storage (any storage class)             */
 /*                     the task variable must be accessible         */
 /*                     for the duration of the associated thread    */
 /*			and as required by the ataching thread.      */
 /*                                                                  */
 /*      Created by:    user                                         */
 /*                                                                  */
 /*      Deleted by:    user                                         */
 /*                                                                  */
 /*      Dependencies:                                               */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /*                                                                  */
 /********************************************************************/

 dcl   1 TASK                based,
         5 TASK_event        char(16),            /* Event variable00*/
	 5 TASK_pTCB         ptr,                 /* ->TCB         10*/
	 5 TASK_priority     fixed bin(31),       /* Priority      14*/
         5 TASK_end          char(0);       /* End of TASK         18*/
	 
