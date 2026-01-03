 /********************************************************************/
 /*      PL/I Compiler - Compiler Limits ver 0.1a                    */
 /********************************************************************/

 dcl     max_dim             fixed bin(31) static     init(   15);
 dcl     max_levels          fixed bin(31) static     init(   15);
 dcl     highest_level_num   fixed bin(31) static     init(  255);
 dcl     max_size_pic        fixed bin(31) static     init(  511);
 dcl     max_len_char        fixed bin(31) static     init(32767);
 dcl     max_len_bit         fixed bin(31) static     init(32767);
 dcl     max_rep_factor      fixed bin(31) static     init(32767);
 dcl     max_prec_fixdec     fixed bin(31) static     init(   18);
 dcl     dft_prec_fixdec     fixed bin(31) static     init(    5);
 dcl     max_prec_fixbin     fixed bin(31) static     init(   31);
 dcl     dft_prec_fixbin     fixed bin(31) static     init(   15);
 dcl     max_prec_fltdec     fixed bin(31) static     init(   20);
 dcl     dft_prec_fltdec     fixed bin(31) static     init(   16);
 dcl     max_prec_fltbin     fixed bin(31) static     init(   64);
 dcl     dft_prec_fltbin     fixed bin(31) static     init(   52);
 dcl     max_scale_factor    fixed bin(31) static     init(  127);
 dcl     min_scale_factor    fixed bin(31) static     init( -128);
 dcl     max_len_int_label   fixed bin(31) static     init(   64);
 dcl     max_len_ext_label   fixed bin(31) static     init(   64);
 dcl     max_len_str_rep     fixed bin(31) static     init( 3600);

