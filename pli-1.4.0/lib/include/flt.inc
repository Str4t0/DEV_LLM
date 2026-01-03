 /********************************************************************/
 /*                                                                  */
 /*      Module:        Intel Floating-point formats                 */
 /*      Version:       1.0                                          */
 /*      Date:          June 2005                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the hardware format Intel          */
 /*                     Single, Double, and Extended precision       */
 /*                     Floating point data.                         */
 /*                                                                  */
 /*      NOTE:          The Byte order here is the reverse of what   */
 /*                     is actually stored in memory, so that the    */
 /*                     order of the bit strings is "natural".       */
 /*                     Data needs to be byte-swapped when accessed  */
 /*                     from memory, and again on storage in memory. */
 /*                                                                  */
 /*      Dependencies:  Intel Architecture.                          */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 SINGLE              based,              /* Single (32-bit)  */
         5 SIN_frac          bit(23),            /* Fraction         */
         5 SIN_sign_exp      bit(9);             /* Sign/exponent    */
                             /* Exponent bias=127                    */

 dcl   1 DOUBLE              based,              /* Single (32-bit)  */
         5 DBL_frac          bit(52),            /* Fraction         */
         5 DBL_sign_exp      bit(12);            /* Sign /exponent   */
                             /* Exponent bias=1023                   */

 dcl   1 EXTENDED            based,              /* Single (32-bit)  */
         5 EXT_frac          bit(63),            /* Fraction         */
         5 EXT_int           bit(1),             /* "I"-bit, '1'b    */
         5 EXT_sign_exp      bit(16);            /* Sign/exponent    */
                             /* Exponent bias=16383                  */

 dcl     SINGLE_PLUSINF      bit(32)   static
                             init( '00007F80'bx );
 dcl     SINGLE_MINUSINF     bit(32)   static
                             init( '0000FF80'bx );
 dcl     SINGLE_NAN          bit(32)   static
                             init( '0000FF80'bx );
 dcl     DOUBLE_PLUSINF      bit(64)   static
                             init( '0000000000007FE0'bx );
 dcl     DOUBLE_MINUSINF     bit(64)   static
                             init( '000000000000FFE0'bx );
 dcl     DOUBLE_NAN          bit(64)   static
                             init( '000000000000FFE0'bx );
 dcl     EXTENDED_PLUSINF    bit(80)   static
                             init( '0000000000000807FFF'bx );
 dcl     EXTENDED_MINUSINF   bit(80)   static
                             init( '000080000000080FFFF'bx );
 dcl     EXTENDED_NAN        bit(80)   static
                             init( '000080000000000FFFF'bx );

