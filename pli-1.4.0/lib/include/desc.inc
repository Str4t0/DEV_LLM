 /********************************************************************/
 /*                                                                  */
 /*      Module:        Runtime Descriptor Formats                   */
 /*      Version:       1.1                                          */
 /*      Date:          Mar, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the layouts for runtime data       */
 /*                     descriptors.                                 */
 /*                                                                  */
 /*      Dependencies:  Mapped in compiled code.                     */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*          2024-08-05 SED fields: union, bit                  1.3.1*/
 /*          2023-08-21 Area descriptors                        1.1.1*/
 /*          2021-04-08 Add st_flg to string desc, change name0.8.10e*/
 /*                     SE_dyn to SE_adj                      0.9.10e*/
 /*          2015-09-19 UNSIGNED FIXED BINARY                  0.9.10*/
 /*          2014-02-15 Add code for OPTIONS(IBM) FIXED DECIMAL 0.9.5*/
 /*          2009-05-19 Add 'SE_union'                           0.7c*/
 /*          2005-08-26 Revise SED format.                           */
 /*          2004-03-10 Add complex, program control.                */
 /*                                                                  */
 /********************************************************************/

 dcl   1 pli_ded_XB          based,              /* Fixed Binary     */
         5 XB_id             char(1),            /* ID - '41'x       */
         5 XB_flgs           bit(8),             /* '80'bx=complex   */
                                                 /* '40'bx=unsigned  */
         5 XB_scale          fixed bin(7),       /* Scale Factor     */
         5 XB_prec           fixed bin(7);       /* Precision        */

 dcl   1 pli_ded_XD          based,              /* Fixed Decimal    */
         5 XD_id             char(1),            /* ID - '42'x       */
         /* FIXED DECIMAL OPTIONS(IBM)              ID - '48'x  0.9.5*/
         5 XD_cplx           bit(8),             /* '80'bx=complex   */
         5 XD_scale          fixed bin(7),       /* Scale Factor     */
         5 XD_prec           fixed bin(7);       /* Precision        */

 dcl   1 pli_ded_LB          based,              /* Float Binary     */
         5 LB_id             char(1),            /* ID - '43'x       */
         5 LB_cplx           bit(8),             /* '80'bx=complex   */
         5 fil1              char(1),            /* (reserved)       */
         5 LB_prec           fixed bin(7);       /* Precision        */

 dcl   1 pli_ded_LD          based,              /* Float Decimal    */
         5 LD_id             char(1),            /* ID - '44'x       */
         5 LD_cplx           bit(8),             /* '80'bx=complex   */
         5 fil1              char(1),            /* (reserved)       */
         5 LD_prec           fixed bin(7);       /* Precision        */

 dcl   1 pli_ded_NP          based,              /* Numeric Picture  */
         5 NP_id             char(1),            /* ID - '45'x Fixed */
                                                 /* ID - '46'x Float */
         5 NP_cplx           bit(8),             /* '80'bx=complex   */
         5 NP_scale          fixed bin(7),       /* Scale Factor     */
         5 NP_prec           fixed bin(7),       /* Precision (# dig)*/
         5 NP_flags          bit(8),             /* Flag byte        */
                             /* '80'bx - signed                      */
                             /* '40'bx - (float picture) exp signed. */
                             /* '20'bx - at least one digit        . */
         5 fil2              char(1),            /* (reserved)       */
         5 NP_size           fixed bin(7),       /* Data length      */
         5 NP_piclen         fixed bin(7),       /* Picture length   */
         5 NP_pic            char(0);            /* Picture spec.    */

 dcl   1 pli_ded_CP          based,              /* Character Picture*/
         5 CP_id             char(1),            /* ID - '47'x       */
         5 fil1              char(1),            /* (reserved)       */
         5 CP_size           fixed bin(7),       /* Data length      */
         5 CP_piclen         fixed bin(7),       /* Picture length   */
         5 CP_pic            char(0);            /* Picture spec.    */

 dcl   1 pli_ded_STR         based,              /* String ded       */
         5 ST_id             char(1),            /* ID -             */
         /* Nonvarying Character   '10'x                             */
         /* Varying character      '11'x                             */
         /* Nonvarying Bit         '20'x                             */
         /* Varying Bit            '21'x                             */
         5 st_flg            bit(8),             /* Flag bits 0.9.10e*/
         /* Unaligned bit string   '80'bx                       1.3.1*/
         5 fil1              char(1),            /* (reserved20050811*/
         5 ST_bo             fixed bin(7),       /* Bit offset       */
         5 ST_len            fixed bin(31);      /* Max length       */

 dcl   1 pli_ded_PC          based,              /* Program Control  */
         5 PC_id             char(1),            /* ID - '50'x       */
         5 fil1              char(1),            /* (reserved)       */
         5 PC_type           char(2),            /* Type             */
                             /* '0080'x - Label                      */
                             /* '0040'x - File                       */
                             /* '0020'x - Entry                      */
                             /* '0010'x - Pointer                    */
                             /* '0008'x - Offset                     */
                             /* '0004'x - Area                       */
                             /* '0002'x - Event                      */
                             /* '0001'x - Task                       */
         /* PC_size is present only for area descriptors. I was 1.1.1*/
         /* going to make them a separate type (51), but didn't.1.1.1*/
         5 PC_size           fixed bin(31);      /* Area size   1.1.1*/

 dcl   1 pli_ded_ARR         based,              /* Array ded        */
         5 AR_id             char(1),            /* ID - '30'x     00*/
         5 AR_unalbit        bit(1),             /* Bit subscr'80'bx */
         /* '1'b = Multipliers represent units of bits               */
         /* '0'b = Multipliers represent units of bytes              */
         5 AR_adj            bit(1),             /* Adj array '40'bx */
         /* '1'b = Adjustable                                        */
         /* '0'b = Non-adjustable                                    */
         5 AR_refer          bit(1),             /* Refer-form'20'bx */
         /* '1'b = Use refer format dimensions                0.9.10e*/
         /* '0'b = Standard array definition                  0.9.10e*/
         5 AR_iSub           bit(1),             /* iSub-defin'10'bx */
         /* '1'b = iSub-defined                                 1.2.1*/
         /* '0'b = Not iSub-defined                             1.2.1*/
         5 fil1              bit(4),             /* (reserved)  1.2.1*/
         /* Array cross-section?                                     */
         5 AR_dim            fixed bin(15),      /* Num of dim's   02*/
         5 AR_rvo            fixed bin(31),      /* Virt orig20061104*/
         5 AR_dims           char(0);            /* Dimension data 08*/

 /* 'AR_dim' dimensions like pli_ded_Dim follow at 'AR_dims'         */
 dcl   1 pli_ded_Dim      (1)based,              /* Dimension      00*/
         5 DM_mult           fixed bin(31),      /* Multiplier     00*/
         5 DM_lbnd           fixed bin(31),      /* Lowest Subscrip04*/
         5 DM_hbnd           fixed bin(31),      /* Highest Subscri08*/
         5 DM_next           char(0);            /* A(Next dimensio0C*/
         /* String desc follows for array of strings                 */
         /* Structure desc follows for array of structures           */

 /* SDD points to list of element info (SED list) for structures     */
 dcl   1 pli_ded_SDD         based,              /* Struct Descriptor*/
         5 SDD_id            char(1),            /* ID - '80'x       */
         5 SDD_flag          bit(8),             /* Flag bits   1,3,1*/
         /* 1... .... ('80'bx) - scalar reference to one array elem  */
         5 fil1              char(2),            /* (unused)    1.3.1*/
         5 SDD_pSED          ptr;                /* ->First SED      */

 /* Structure descriptors are placeholders for arrays of structures. */
 dcl   1 pli_ded_SD          based,              /* Struct Descriptor*/
         5 SD_id             char(1),            /* ID - '85'x       */
         5 fil1              char(3);            /* (unused)         */

 /* Structure element descriptors (SEDs) compose a list of           */
 /* information for each element and minor structure.                */
 /* An entry following the last contains the offset of the byte      */
 /* following the structure (structure length)                       */
         /* SED format:                                              */
         /*    +0: Flag word                                         */
         /*    +4: Element offset in structure                       */
         /*    +8: Element Descriptor address                        */
 dcl   1 pli_ded_SED         based,              /* Struct Elem desc.*/
         5 fil1,                                 /* Flag byte        */
           10 SE_str         bit(1),             /*              00.0*/
           /* '1'b - Minor structure                   '80'bx        */
           /* '0'b - Element                                         */
           10 SE_array       bit(1),             /*              00.1*/
           /* '1'b - Structure or element is array     '40'bx        */
           /* '0'b - Structure or element is scalar                  */
           10 SE_last        bit(1),             /*              00.2*/
           /* '1'b - This is last structure element    '20'bx        */
           /* '0'b - Not last structure element                      */
           10 SE_adj         bit(1),             /*           0.9.10e*/
           /* '1'b - This is adjustable element        '10'bx        */
           /* '0'b - Not adjustable element                          */
           10 SE_alignd      bit(1),             /* Alignment opt00.4*/
           /* '1'b - 'ALIGNED'                         '08'bx        */
           /* '0'b - 'UNALIGNED'                                     */
           10 SE_union       bit(1),             /* Alignment opt00.5*/
           /* '1'b - 'UNION'                           '04'bx        */
           /* '0'b - Not a union                                     */
           10 SE_bit         bit(1),             /* Bit struct  1.3.1*/
           /* '1'b - Structure is unaligned bits       '02'bx   1.3.1*/
           10 fil2           bit(1),             /* (reserved)  1.3.3*/
           10 SE_lvl         bit(8),             /* Norm level   01  */
           10 SE_align       fixed bin(7),       /* Alignment    02  */
           10 SE_bitoffset   fixed bin(7),       /* Bit offset   03  */
         5 SE_offset         fixed bin(31),      /* Base elem off04  */
         5 SE_desc           ptr,                /* Desc addr    08  */
         /* No descriptor present for structures that aren't arrays. */
         5 SE_end            char(0);            /* addr(next_SED0C  */
         /* The last SED for a major structure is followed by a      */
         /* dword of zeroes (placeholder for the ID dword) and the   */
         /* offset of the last+1 byte of the structure.              */
         /* This equals the size of the structure.                   */

