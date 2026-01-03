 /********************************************************************/
 /*                                                                  */
 /*      Module:        Dynamic Savearea (DSA) format                */
 /*      Version:       1.0                                          */
 /*      Date:          Jun, 2000                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the standard DSA for a procedure   */
 /*                     or begin-block for compiler version 0.1a.    */
 /*                                                                  */
 /*      DSA is addressed as negative offsets from EBP               */
 /*      and usually listed high-address to low-address.             */
 /*      Fields here are listed low-address to high-address.         */
 /*                                                                  */
 /*      PL/I Function '_pli_GetDSA' returns the value of            */
 /*      the calling procedure's EBP.                                */
 /*                                                                  */
 /*      Dependencies: Mapped in compiled code and 'framedef.inc'.   */
 /*                    Also dependent on standard Intel calling seq. */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*          2025-01-31: Add arg count at -'1E'x                1.3.2*/                                                              
 /*                                                                  */
 /********************************************************************/

 dcl   1 pli_dsa             based,
 /* (Arrangement of this data is arbitrary by PL/I convention)       */
 /* For FROMALIEN procedures an additional two dwords are        0.6a*/
 /* reserved at this point to save the caller's original         0.6a*/
 /* EDI at -'24'x and original ESI at -'28'x.                    0.6a*/
        2 dsa_below_ebp,                         /*        EBP-'20'x */
         5 dsa_bos           ptr,      /* Bottom of stack addr-'20'x */
         5 fil1,                       /*                            */
           10 dsa_epi        bit(8),   /* Current EP ID       -'1F'x */
           10 dsa_argc       fixed bin(8) unsigned,/* Arg cnt   1.3.2*/
           10 dsa_msk        bit(16),  /* Condition mask      -'1C'x */
           /* See 'condmask' for bit settings of 'dsa_msk'.          */
         5 dsa_chc           ptr,      /* -> ONCB Chain       -'18'x */
         5 dsa_stt           ptr,      /* -> Statement num tab-'14'x */
         5 dsa_epa           ptr,      /* Entry Point address -'10'x */
         5 dsa_ebx           ptr,      /* Caller's EBX        -'0C'x */
         5 dsa_esi           ptr,      /* Caller's ESI (->Stat-'08'x */
         5 dsa_edi           ptr,      /* Caller's EDI (->PGT)-'04'x */

 /* Current EBP contains the address of this minor structure.        */
 /* (This data fixed by architecture and Intel calling convention)   */
        2 dsa_above_ebp,                         /*        EBP+'00'x */
         5 dsa_ebp           ptr,      /* Caller's EBP        +'00'x */
         5 dsa_eip           ptr,      /* Caller's EIP        +'04'x */
         5 dsa_parm          char(0);  /* Parameters          +'08'x */
         /* First parameter at dsa_parm                              */
         /* Address of returned value at highest parameter address   */
