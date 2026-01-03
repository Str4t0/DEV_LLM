 /* Modifications:                                                     */
 /*     2023-01-02: "pl_gid" corrected to "pi_gid".                    */
 dcl    1 PLIProcInfo         based,
          5 pi_len            fixed bin(31),      /* Size of area    00*/
	  5 pi_pid            fixed bin(31),      /* Process id      04*/
	  5 pi_tid            fixed bin(31),      /* Thread id       08*/
	  5 fil1              char(20),           /* Reserved        0C*/
	  5 pi_uid            fixed bin(31),      /* User id         20*/
	  5 pi_gid            fixed bin(31);      /* Group id        24*/
