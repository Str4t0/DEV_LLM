 /********************************************************************/
 /*                                                                  */
 /*      Module:        OS/2 Process Information Block (PIB)         */
 /*      Version:       1.0                                          */
 /*      Date:          Jan, 2001                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Provides an overlay for the OS/2             */
 /*                     Process Information Block structure.         */
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

 dcl   1 PIB                 based,
         5 pib_ulpid         fixed bin(31),      /* Process ident.   */
         5 pib_ulppib        fixed bin(31),      /* Parent process id*/
         5 pib_htme          fixed bin(31),      /* Module handle    */
         5 pib_pchcmd        ptr,                /* -> Command Line  */
         5 pib_pchenv        ptr,                /* -> Environment   */
         5 pib_flstatus      bit(32),            /* Status bits      */
         /* '01000000'bx - in exit processing                        */
         5 pib_ultype        fixed bin(31);      /* Process type code*/
         /* 0 - Full Screen          - Protected Mode                */
         /* 1 - DOS emulation        - Real Mode                     */
         /* 2 - VIO                  - Protected Mode                */
         /* 3 - Presentation Manager - Protected Mode                */
         /* 4 - Detached             - Protected Mode                */

