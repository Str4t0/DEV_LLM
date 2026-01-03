 /********************************************************************/
 /*                                                                  */
 /*      Module:        DSA Enabled Condition Mask                   */
 /*      Version:       1.0                                          */
 /*      Date:          Mar, 2001                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Bit settings for enabled condition mask in   */
 /*                     DSA, used by library routines.               */
 /*                     '1'b indicates corresponding condition is    */
 /*                     enabled.                                     */
 /*                                                                  */
 /*      Dependencies:  DSA format                                   */
 /*                     Mapped in compiled code and 'init'.          */
 /*                                                                  */
 /*      Modifications:                                              */
 /*          2011-08-10 - add FROMALIEN flag                    0.9.3*/
 /*                                                                  */
 /********************************************************************/

 dcl   1 cond_mask           unaligned,
         5 M_Conversion      bit(1),        /*  1  1000 0000         */
         5 M_Fixedoverflow   bit(1),        /*  2  0100 0000         */
         5 M_Overflow        bit(1),        /*  3  0010 0000         */
         5 M_Size            bit(1),        /*  4  0001 0000         */
         5 M_Stringrange     bit(1),        /*  5  0000 1000         */
         5 M_Stringsize      bit(1),        /*  6  0000 0100         */
         5 M_Subscriptrange  bit(1),        /*  7  0000 0010         */
         5 M_Underflow       bit(1),        /*  8  0000 0001         */
         5 M_Zerodivide      bit(1),        /*  9  xxxx xxxx 1000    */
         5 *                 bit(3),                          /*1.3.2*/
	 5 M_Tasking         bit(1),        /* 13  Multitasking 1.3.2*/
	 5 M_FromAlien       bit(1),   /* This DSA is FROMALIEN 0.9.3*/
         5 M_OnUnit          bit(1),   /* This DSA is an ON-Unit     */
         5 M_LibMod          bit(1);   /* This DSA is a Library Proc.*/

