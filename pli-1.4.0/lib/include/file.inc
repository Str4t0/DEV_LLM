 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I FILE constant/variable.                 */
 /*      Version:       1.1                                          */
 /*      Date:          Jul, 2003                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes FILE constants and variables.      */
 /*                                                                  */
 /*      Where held:    FILE constants - external or static storage. */
 /*                     FILE variables - anywhere.                   */
 /*                                                                  */
 /*      Dependencies:  Mapped in compiled code.                     */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                     2004-02-10: Version 1.1.  Remap file         */
 /*                                 constants vs. variables.         */
 /*                                                                  */
 /********************************************************************/

 dcl   1 FILE_Constant       aligned based,
         5 FC_pFCB           ptr,                /* -> FCB or SYSNU00*/
         5 fil               ptr,                /* (unused)       04*/
         5 FC_pName          ptr,                /* -> File name   08*/
         5 FC_end            char(0);            /* End of FILE    0C*/

 dcl   1 FILE_Variable       aligned based,
         5 FV_pFILE          ptr,                /* -> FILE constan00*/
         5 FV_pDCLCB         ptr,                /* -> DCLCB       04*/
         5 FV_pName          ptr,                /* -> File name   08*/
         5 FV_end            char(0);            /* End of FILE    0C*/

 dcl     File_Name           char(64)  varying   based;

