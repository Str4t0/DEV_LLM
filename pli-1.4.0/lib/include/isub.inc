 /********************************************************************/
 /*                                                                  */
 /*      Module:        iSub parameter block                         */
 /*      Version:       1.0 (PL/I version 1.2.1)                     */
 /*      Date:          Feb, 2024                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the parameter block passed to      */
 /*                     the iSub thunk to compute element addresses  */
 /*                     in an iSub-defined array.                    */
 /*                                                                  */
 /*      Size:          16 bytes.                                    */
 /*                                                                  */
 /*      Dependencies:                                               */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 /* Basic parm list                    */
 dcl    1 iSub_parm           unaligned based,
          5 iSub_pOut         ptr,      /* ->Output subscript list   */
          5 iSub_pIn          ptr,      /* ->Input subscript list    */
          5 iSub_pDesc        ptr,      /* ->Base variable descr     */
          5 iSub_pDSA         ptr,      /* ->Caller's DSA address    */
          5 iSub_end          char(0);  /* Subscript lists follow    */

 /* Input and output subscript lists   */
 dcl    1 iSub_subsc          unaligned based,    /* Subscript lists */
          5 iSub_nSub         fixed bin(31),      /* Number of subsc */
          /* Followed by iSub_nSub subscripts                        */
          5 iSub_sub       (1)fixed bin(31);      /* Subscripts      */

