 /*******************************************************************/
 /*           PL/I Definition of 'tm' structure.                    */
 /*******************************************************************/
 dcl   1 tm                  based,
         5 tm_sec            fixed bin(31),/* Seconds.	[0-60] (1 le*/
         5 tm_min            fixed bin(31),/* Minutes.	[0-59]      */
         5 tm_hour           fixed bin(31),/* Hours.	[0-23]      */
         5 tm_mday           fixed bin(31),/* Day.	[1-31]      */
         5 tm_mon            fixed bin(31),/* Month.	[0-11]      */
         5 tm_year           fixed bin(31),/* Year                  */
         5 tm_wday           fixed bin(31),/* Day of week. [0-6]    */
         5 tm_yday           fixed bin(31),/* Days in year.[0-365]  */
         5 tm_isdst          fixed bin(31);/* DST.	[-1/0/1]    */

