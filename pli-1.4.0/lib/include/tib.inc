 /********************************************************************/
 /*                                                                  */
 /*      Module:        OS/2 Thread Information Block (TIB)          */
 /*      Version:       1.0                                          */
 /*      Date:          Jan, 2001                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Provides an overlay for the OS/2             */
 /*                     Thread Information Block structure.          */
 /*                                                                  */
 /*      Dependencies:  OS/2 Warp 4                                  */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                     Change FIXED BIN(31) fields to UNSIGNED      */
 /*                     when this is supported.                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 TIB                 based,
         5 tib_pexchain      ptr,                /* -> Head of chn 00*/
         5 tib_pstack        ptr,                /* -> Stack base  04*/
         5 tib_pstacklimit   ptr,                /* -> End of stack08*/
         5 tib_ptib2         ptr,                /* -> Sys spec TIB0C*/
         5 tib_version       fixed bin(31),      /* TIB Version num10*/
         5 tib_ordinal       fixed bin(31);      /* Thread ordinal 14*/

 dcl   1 TIB2                based,
         5 tib2_ultid        fixed bin(31),      /* Thread identifi00*/
         5 tib2_ulpri        fixed bin(31),      /* Thread priority04*/
         5 tib2_version      fixed bin(31),      /* TIB2 version   08*/
         5 tib2_usMCCount    fixed bin(15),      /* Must-complete c0C*/
         5 tib2_fMCForceFlag fixed bin(15);      /* Must-comp force10*/

