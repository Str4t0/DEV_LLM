 /********************************************************************/
 /*                                                                  */
 /*      Module:        Area header                                  */
 /*      Version:       1.1                                          */
 /*      Date:          Jul, 2023                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the header for a PL/I Area         */
 /*                     This is based on the PL/I(F) area definition */
 /*                     GY28-6801-6: PL/I Subroutine Library         */
 /*                                  Program Logic Manual, pp.47-48  */
 /*                                                                  */
 /*                     The header is the first 20 bytes of an area. */
 /*                                                                  */
 /*      Size:          20 bytes ('14'x)                             */
 /*                                                                  */
 /*      Dependencies:                                               */
 /*                                                                  */
 /*      Notes:         The system information in an area contains   */
 /*                     no addresses, only offsets.                  */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 area                based,              /* Area header      */
         5 area_flags        bit(8),             /*                00*/
           /* Area empty     0... ....                               */
         5 fil1              char(3),            /* (reserved)     01*/
         5 area_size         fixed bin(31),      /* Allocated size 04*/
         5 area_end_extent   fixed bin(31),      /* Off end of xtnt08*/
         5 area_largest_free fixed bin(31),      /* Off larg free  0C*/
         5 area_end_chn      fixed bin(31),      /* End FL chn (0) 10*/
         5 area_user_area    char(0);            /* End system info14*/

 /* Free block header */
 dcl   1 area_fbh            based,              /* Free block hdr   */
         5 area_fbh_next     fixed bin(31),      /* ->Next free b  00*/
         5 area_fbh_size     fixed bin(31);      /* free blk size  04*/
     
