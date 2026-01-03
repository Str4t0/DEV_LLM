 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I I/O status information for ON-Unit.     */
 /*      Version:       1.2                                          */
 /*      Date:          Jan, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      This structure is built by procedures that   */
 /*                     raise input-output conditions.  It is        */
 /*                     passed by the condition handler to the       */
 /*                     on-unit to provide data for the condition    */
 /*                     handling builtin functions.                  */
 /*                                                                  */
 /*      Length:        12 bytes ('0C'x).                            */
 /*                                                                  */
 /*      Where held:    Temporary (stack) storage of various I/O     */
 /*                     procedures until completion of the           */
 /*                     on-Unit (if any) associated with an          */
 /*                     input-output statement.                      */
 /*                                                                  */
 /*      Pointed to by: The address of this structure is placed      */
 /*                     in the File Control Block (FCB) field        */
 /*                     'FCB_pError' before the condition is         */
 /*                     raised.  Condition handling retieves this    */
 /*                     address by calling '_pli_IOStat' and         */
 /*                     passes the address as a hidden parameter     */
 /*                     to the associated ON-Unit.                   */
 /*                                                                  */
 /*      Created by:    I/O procedure before raising condition.      */
 /*                                                                  */
 /*      Deleted by:    Completion of condition handling             */
 /*                     (when stack activation record is deleted).   */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /*                                                                  */
 /********************************************************************/

 dcl   1 IOONC               aligned based,
         /* All elements point to varying strings,  SYSNULL          */
         /* indicates "not used".                                    */
         5 IOO_ONFILE        ptr,                /* -> file name   00*/
         5 IOO_DATAFIELD     ptr,                /* -> data name   04*/
         5 IOO_ONKEY         ptr,                /* -> key         08*/
         5 IOO_end           char(0);            /* End of struct. 0C*/

