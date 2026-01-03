 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I CONTROLLED Variable prefix.             */
 /*      Version:       1.0                                          */
 /*      Date:          Jun, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      This is the prefix indormation stored with   */
 /*                     each generation of a CONTROLLED variable.    */
 /*                                                                  */
 /*      Where held:    Heap storage.                                */
 /*                                                                  */
 /*      Dependencies:  None.                                        */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 CTLH                aligned based,
         5 CH_LocDesc,                           /* Loc/Desc       00*/
           10 CH_pData       ptr,                /* addr(data)     00*/
           10 CH_pDesc       ptr,                /* addr(descr)    04*/
         5 CH_prev           ptr,                /* addr(prev gen) 08*/
         5 CH_pTCB           ptr,                /* addr(owners TCB0C*/
         5 CH_AllocCnt       fixed bin(31),      /* Alloc Count    10*/
         5 CH_TaskNext       ptr,                /* Task CV chain  14*/
         5 CH_TaskPrev       ptr,                /* Task CV chain  18*/
         5 CH_desc           char(0);            /* End of hdr     1C*/
         /* The descriptor follows immediately, followed by the data */

