/*--------------------------------------------------------*/
/*        PL/I equivalent of timespec from time.h         */
/*--------------------------------------------------------*/ 
 dcl    1 timespec            based,
          5 tv_sec            fixed bin(31),
	  5 tv_nsec           fixed bin(31);
