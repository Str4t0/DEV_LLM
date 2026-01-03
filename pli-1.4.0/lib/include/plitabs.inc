 /*------------------------------------------------------------------*/
 /*      PLITABS Declaration                                         */
 /*      - SC26-3113-01, p.142                                       */
 /*------------------------------------------------------------------*/
 dcl   1 plitabs             external( 'PLITABS' ),
         5 offset            fixed bin(15), /* Offset of tab count 00*/
         5 pagesize          fixed bin(15), /* Default page size   02*/
         5 linesize          fixed bin(15), /* Default line size   04*/
         5 pagelength        fixed bin(15), /* Default page length 06*/
         5 fill1             fixed bin(15), /* (reserved)          08*/
         5 fill2             fixed bin(15), /*    "                0A*/
         5 fill3             fixed bin(15), /*    "                0C*/
         5 no_of_tabs        fixed bin(15), /* Num of occ's of tab 0E*/
         5 tab          (255)fixed bin(15); /* First tab position  10*/
