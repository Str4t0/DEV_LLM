 /*------------------------------------------------------------------*/
 /*                    ONCODES (Base Values)                         */
 /* Modifications:						     */
 /*	2010-03-04: 'fovl' should have been 'fofl'.		 0.8d*/
 /*------------------------------------------------------------------*/
 dcl     oncode_finish       fixed bin(15)  static    init(    4 );
 dcl     oncode_error        fixed bin(15)  static    init(    9 );
 dcl     oncode_name         fixed bin(15)  static    init(   10 );
 dcl     oncode_record       fixed bin(15)  static    init(   20 );
 dcl     oncode_transmit     fixed bin(15)  static    init(   40 );
 dcl     oncode_key          fixed bin(15)  static    init(   50 );
 dcl     oncode_endfile      fixed bin(15)  static    init(   70 );
 dcl     oncode_undf         fixed bin(15)  static    init(   80 );
 dcl     oncode_endpage      fixed bin(15)  static    init(   90 );
 dcl     oncode_pending      fixed bin(15)  static    init(  100 );
 dcl     oncode_strz         fixed bin(15)  static    init(  150 );
 dcl     oncode_ofl          fixed bin(15)  static    init(  300 );
 dcl     oncode_fofl         fixed bin(15)  static    init(  310 );
 dcl     oncode_zdiv         fixed bin(15)  static    init(  320 );
 dcl     oncode_ufl          fixed bin(15)  static    init(  330 );
 dcl     oncode_size         fixed bin(15)  static    init(  340 );
 dcl     oncode_strg         fixed bin(15)  static    init(  350 );
 dcl     oncode_area         fixed bin(15)  static    init(  360 );
 dcl     oncode_attn         fixed bin(15)  static    init(  400 );
 dcl     oncode_cond         fixed bin(15)  static    init(  500 );
 dcl     oncode_check        fixed bin(15)  static    init(  510 );
 dcl     oncode_subrg        fixed bin(15)  static    init(  520 );
 dcl     oncode_conv         fixed bin(15)  static    init(  600 );

