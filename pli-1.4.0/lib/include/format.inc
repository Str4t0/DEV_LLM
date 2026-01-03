 /********************************************************************/
 /*                                                                  */
 /*      Module:        Runtime Layout of FORMAT information         */
 /*      Version:       1.0                                          */
 /*      Date:          Sep, 2003                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the layouts for runtime            */
 /*                     FORMAT data.                                 */
 /*                                                                  */
 /*      Dependencies:  Mapped in compiled code.                     */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*          2012-07-08: L Format-item                          0.9.3*/
 /*                                                                  */
 /********************************************************************/

 dcl   1 fmt_item            unaligned based,    /* Format item      */
         5 fi_nond           bit(1),             /* '1'b=non-data    */
         5 fi_np             bit(2),             /* # parameters(0:3)*/
         5 fi_id             bit(5),             /* Format code      */
           /* '0 0000'b  (0) - A(field-width)                        */
           /* '0 0001'b  (1) - B(field_width)                        */
           /* '0 0010'b  (2) - C(real-format-spec,real-format-spec)  */
           /* '0 0011'b  (3) - COLUMN(character-position)            */
           /* '0 0100'b  (4) - E(field-width,fract-dig,sig-digits)   */
           /* '0 0101'b  (5) - F(field-width,fract-dig,scale-factor) */
           /* '0 0110'b  (6) - G(field-width)                        */
           /* '0 0111'b  (7) - LINE(line-number)                     */
           /* '0 1000'b  (8) - P'picture-specification'              */
           /* '0 1001'b  (9) - PAGE                                  */
           /* '0 1010'b (10) - R(remote-format-addr)(thunk-addr)     */
           /* '0 1011'b (11) - SKIP(relative-line)                   */
           /* '0 1100'b (12) - X(field-width)                        */
           /* '0 1101'b (13) - B4(field_width)               20040127*/
           /* '0 1110'b (14) - B3(field_width)               20040127*/
           /* '0 1111'b (15) - L                                0.9.3*/
           /* (internal format controls)                             */
           /* '1 1100'b (28) - FRMT(thunk-address)           20040127*/
           /* '1 1101'b (29) - REP(workarea,rep_factor)      20040127*/
           /* '1 1110'b (30) - ENDR(offset)                  20040127*/
           /* '1 1111'b (31) - ENDF(offset)                          */
         5 fi_end            char(0);            /* End Format item  */

 dcl   1 fmt_opnd            based,              /* Format operand   */
         5 fo_type           char(1),            /* Format type      */
           /* '0xxx xxxx'B  - xxxxxxx is UNSIGNED FIXED BIN(7)       */
           /*                 This is a range 0:127                  */
           /* '1000 0001'B (81) - FIXED BIN(7)(value)                */
           /* '1000 0010'B (82) - FIXED BIN(15)(value)               */
           /* '1000 0100'B (84) - FIXED BIN(31)(value)               */
           /* '1000 1000'B (88) - thunk(address)                     */
           /* '1000 1001'B (89) - PTR                           0.9.1*/
         5 fo_end            char(0);            /* End Operand desc */

 /* Operands                          */
 dcl     fmt_fb7             fixed bin(7)  based;
 dcl     fmt_fb15            fixed bin(15) based;
 dcl     fmt_fb31            fixed bin(31) based;

