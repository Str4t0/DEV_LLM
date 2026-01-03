 /*-------------------------*/
 /* Internal Float Format   */
 /*-------------------------*/
 dcl   1 IntFlt              based,    /* Internal FP format         */
         5 IF_frac           fixed dec(18),      /* Fraction         */
         /* High-order digit is most significant                     */
         5 IF_exp            fixed bin(15);      /* Power of 10 exp. */

