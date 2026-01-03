 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Statement Offset Table                  */
 /*      Version:       1.0                                          */
 /*      Date:          Aug, 2015 (0.9.9)                            */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Contains debug information optionally stored */
 /*                     in a module.                                 */
 /*                                                                  */
 /*      Where held:    Code segment of compile unit                 */
 /*                                                                  */
 /*      Pointed to by: dsa_stt of each procedure.                   */
 /*                     All procedures in a compile unit will point  */
 /*                     to the same stt data.                        */
 /*                     dsa_stt will be SYSNULL for programs         */
 /*                     compiled without the debug option (-N).      */
 /*                                                                  */
 /*      Dependencies:  None.                                        */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 STT                 aligned based,
         5 stt_off           fixed bin(31),       /* offset from 0  01*/
         5 stt_nm_off        fixed bin(31),      /* Offset of name 04*/
         5 stt_end           char(0);            /* Start of entrie08*/

 dcl   1 stt_ent             aligned based,      /* Stmt entries     */
         5 stt_stoff         fixed bin(31),      /* Starting offset00*/
         /* Last entry will have offset = -1    */
         5 stt_line          fixed bin(31),      /* Line number    04*/ 
         5 stt_next          char(0);            /* Addr(next ent) 08*/

 dcl     stt_name            char(512)  varying   based;
