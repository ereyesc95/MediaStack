using DeviceId;
using MySql.Data.MySqlClient;
using System;
using System.Collections.Generic;
using System.Data;

namespace MediaBinger
{
    internal class ExtServices
    {
        public static MySqlConnection con = new MySqlConnection("server =localhost; Uid=root; password = manager ; persistsecurityinfo = True; database =databinger; SslMode = none");

        #region Machine Section
        /// <summary>
        /// Method to create a machine
        /// </summary>
        /// <param name="strDevice"></param>
        /// <param name="datLogin"></param>
        internal static void CreateMachine(string strDevice, DateTime datLogin)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("INSERT INTO databinger.system (sysDevice,sysLoginDate) VALUES (@0,@1);", con);
            cmd.Parameters.AddWithValue("@0", strDevice);
            cmd.Parameters.AddWithValue("@1", datLogin.ToString());

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
        }

        /// <summary>
        /// Method to get a machine by Device name
        /// </summary>
        /// <param name="strDeviceId"></param>
        /// <returns></returns>
        internal static DataTable GetMachine(string strDeviceName)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT sysID FROM databinger.system WHERE sysDevice = @0", con);
            cmd.Parameters.AddWithValue("@0", strDeviceName);

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

            return dt.Rows.Count > 0 ? dt : null;
        }


        /// <summary>
        /// Method to update machine's data by ID
        /// </summary>
        /// <param name="intMachineID"></param>
        /// <param name="datLogin"></param>
        internal static void UpdateMachine(int intMachineID, DateTime datLogin)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("UPDATE databinger.system SET sysLoginDate = @1 WHERE sysID = @0", con);
            cmd.Parameters.AddWithValue("@0", intMachineID);
            cmd.Parameters.AddWithValue("@1", datLogin.ToString());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
        }

        internal static DataTable GetContents()
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT * FROM databinger.contenttype", con);
            try
            {
                if (con != null && con.State == ConnectionState.Open)
                    con.Close();

                if (con != null && con.State == ConnectionState.Closed)
                    con.Open();

                dt.Load(cmd.ExecuteReader());

                if (con != null && con.State == ConnectionState.Open)
                    con.Close();

                return dt.Rows.Count > 0 ? dt : null;
            }
            catch (Exception)
            {

                return null;
            }
            
        }

        #endregion

        #region User Section

        /// <summary>
        /// Method to create users
        /// </summary>
        /// <param name="lstData"></param>
        /// <returns></returns>
        internal static bool CreateUser(List<string> lstData)
        {
            try
            {
                MySqlCommand cmd = null;
                DataTable dt = new DataTable();
                cmd = new MySqlCommand("INSERT INTO databinger.user(usrName,usrBirthDate,usrPassword,usrMail,usrFirstName,usrLastName,usrGenderID,usrRegistrationDate,usrRoleID,usrMachineID) values(@0,@1,@2,@3,@4,@5,@6,@7,@8,@9)", con);
                cmd.Parameters.AddWithValue("@0", lstData[0]);
                cmd.Parameters.AddWithValue("@1", lstData[1]);
                cmd.Parameters.AddWithValue("@2", lstData[2]);
                cmd.Parameters.AddWithValue("@3", lstData[3]);
                cmd.Parameters.AddWithValue("@4", lstData[4]);
                cmd.Parameters.AddWithValue("@5", lstData[5]);
                cmd.Parameters.AddWithValue("@6", Convert.ToInt32(lstData[6]));
                cmd.Parameters.AddWithValue("@7", lstData[7]);
                cmd.Parameters.AddWithValue("@8", Convert.ToInt32(lstData[8]));

                DataTable dtMachineData = GetMachine(new DeviceIdBuilder().AddMachineName().AddMacAddress().AddUserName().ToString());
                string strMachineID = dtMachineData != null ? dtMachineData.Rows[0]["sysID"].ToString() : null;
                cmd.Parameters.AddWithValue("@9", strMachineID);

                if (con != null && con.State == ConnectionState.Closed)
                    con.Open();

                cmd.ExecuteNonQuery();

                if (con != null && con.State == ConnectionState.Open)
                    con.Close();

                return true;
            }

            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Method to get user data
        /// </summary>
        /// <param name="user"></param>
        /// <param name="pass"></param>
        /// <returns></returns>
        internal static DataTable GetUserData(string user, string pass)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT usrID, usrPassword, usrRoleID FROM databinger.user WHERE usrName = @0", con);
            cmd.Parameters.AddWithValue("@0", user);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 && pass == System.Text.Encoding.UTF8.GetString(System.Convert.FromBase64String(dt.Rows[0]["usrPassword"].ToString())) ? dt : null;
        }

        internal static DataTable GetUserByUserNameOrMail(string strUserName, string strMail)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT usrName FROM databinger.user WHERE usrName = @0 OR usrMail = @1", con);
            cmd.Parameters.AddWithValue("@0", strUserName);
            cmd.Parameters.AddWithValue("@1", strMail);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static void UpdateUserField(int intUserID, DateTime date)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("UPDATE databinger.user SET usrLastLoginDate = @1 WHERE usrID = @0", con);
            cmd.Parameters.AddWithValue("@0", intUserID);
            cmd.Parameters.AddWithValue("@1", date.ToString());

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
        }
        #endregion

        #region Data section
        /// <summary>
        /// Method to get genders
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetGenders()
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT * FROM databinger.genders;", con);

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Method to get roles
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetRoles()
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT * FROM databinger.userroles;", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Method to get continents
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetContinents()
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT * FROM databinger.continents;", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Method to get countries
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetCountries()
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT * FROM databinger.countries;", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Method to get table columns
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetContentByTableName(string strTableName)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT * FROM " + strTableName, con);
            cmd.Parameters.AddWithValue("@0", strTableName);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Method to get table names
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetTableNames()
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            //cmd = new MySqlCommand("SELECT `TABLE_NAME`,`COLUMN_NAME` FROM `INFORMATION_SCHEMA`.`COLUMNS` WHERE `TABLE_SCHEMA`= 'databinger'", con);
            cmd = new MySqlCommand("SELECT table_name, table_comment FROM information_schema.tables WHERE table_schema= 'databinger';", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Method to get table columns
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetTableColumns(string strTableName)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT column_name, column_comment FROM information_schema.columns WHERE table_schema= 'databinger' and table_name =@0;", con);
            cmd.Parameters.AddWithValue("@0", strTableName);


            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

   
            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Get a record using a specific field value
        /// </summary>
        /// <param name="strTableName"></param>
        /// <param name="strFieldName"></param>
        /// <param name="strFieldValue"></param>
        /// <returns></returns>
        internal static DataTable GetRecordByValue(string strTableName, string strFieldToFind, string strValueToFind, string strOrderBy = "", string strOrder = "ASC", string strLimit="")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            if (strLimit != "")
            {
                strLimit = "LIMIT " + strLimit;
            }
            strValueToFind = strValueToFind != null && strValueToFind != "" ? strValueToFind.Replace("'", "█").Replace("/", " ⁄ ") : "";

            if (strTableName == "reproductions")
            {
                strValueToFind = strValueToFind.Replace(" ⁄ ", "/");
            }

            cmd = strOrderBy == "" ? new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " =@0;", con) : new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " =@0 ORDER BY " + strOrderBy + " "+ strOrder + " " + strLimit + ";", con);
            cmd.Parameters.AddWithValue("@0", strValueToFind);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable GetValuesByGroupedColumn(string strTableName, string selectField, string countColumn, string strGroupBy, string strOrder)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT "+ selectField + ", COUNT(*) AS "+ countColumn + " FROM "+ strTableName + " GROUP BY "+ strGroupBy + " ORDER BY "+ countColumn + ";", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable GetRecordById(string strTableName, string strFieldToFind, int strValueToFind, string strOrderBy = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();

            cmd = strOrderBy == "" ? new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " =@0;", con) : new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " =@0 ORDER BY " + strOrderBy + " ASC;", con);
            cmd.Parameters.AddWithValue("@0", strValueToFind);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }
        internal static DataTable GetDistinctRecordByValue(string strFieldDist, string strTable, string strFieldWhere, string strValue, string strCondition, string strOrderBy = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();

            cmd = strOrderBy == "" ? new MySqlCommand("SELECT DISTINCT "+ strFieldDist + " FROM " + strTable + " WHERE " + strFieldWhere + " " + strCondition + " '" + strValue + "';", con) : new MySqlCommand("SELECT DISTINCT " + strFieldDist + " FROM " + strTable + " WHERE " + strFieldWhere + " " + strCondition + " '" + strValue + "' ORDER BY " + strOrderBy + " ASC;", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable GetRecordByIdDiffNull(string strTableName, string strFieldToFind, string strOrderBy = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();

            cmd = strOrderBy == "" ? new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " is not NULL;", con) : new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " is not NULL ORDER BY " + strOrderBy + " ASC;", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable GetRecordByValuesRegExp(string strTableName, string strFieldToFind, string strValueToFind, string strOrderBy = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            strValueToFind = "'" + strValueToFind + "'";

            cmd = strOrderBy == "" ? new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " REGEXP " + strValueToFind + ";", con) : new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " REGEXP " + strValueToFind + " ORDER BY " + strOrderBy + " ASC;", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }
        /// <summary>
        /// Get a record using a specific field value
        /// </summary>
        /// <param name="strTableName"></param>
        /// <param name="strFieldName"></param>
        /// <param name="strFieldValue"></param>
        /// <returns></returns>
        internal static DataTable GetRecordByValueInnerField(string strTableName1, string strRefField1, string strResultField1, string strTableName2, string strFieldToFind2, string strRefField2, string strValueToFind, string strOrderBy)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            strValueToFind = strValueToFind != null && strValueToFind != "" ? strValueToFind.Replace("'", "█").Replace("/", " ⁄ ") : "";


            cmd = new MySqlCommand("SELECT "+ strTableName1 + ".* , "+ strTableName2 + "."+ strFieldToFind2 + " FROM "+ strTableName1 + " INNER JOIN  " + strTableName2 + " ON " + strTableName1 + "."+ strRefField1 + " = "+ strTableName2 + "."+ strRefField2 + " WHERE " + strTableName1 + "." +strResultField1+" = " + strValueToFind + " ORDER BY " + strOrderBy + " ASC;", con);
            cmd.Parameters.AddWithValue("@0", strValueToFind);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }
        internal static DataTable GetRecordByTwoValues(string strTableName, string strFieldToFind, string strValueToFind, string strFieldToFind2, string strValueToFind2, string strOrderBy, string strOrderType = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            strValueToFind = strValueToFind != null && strValueToFind != "" ? strValueToFind.Replace("'", "█").Replace("/", " ⁄ ") : "";
            strValueToFind2 = strValueToFind2.Replace("'", "█").Replace("/", " ⁄ ");

            cmd = new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " = '" + strValueToFind + "' AND " + strFieldToFind2 + " = '" + strValueToFind2 + "' ORDER BY " + strOrderBy + " " + strOrderType + "; ", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable GetRecordByThreeValues(string strTableName, string strFieldToFind, string strValueToFind, string strFieldToFind2, string strValueToFind2, string strFieldToFind3, string strValueToFind3, string strOrderBy, string strOrderType = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            strValueToFind = strValueToFind != null && strValueToFind != "" ? strValueToFind.Replace("'", "█").Replace("/", " ⁄ ") : "";

            cmd = new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " = '" + strValueToFind + "' AND " + strFieldToFind2 + " = '" + strValueToFind2 + "' AND " + strFieldToFind3 + " = '" + strValueToFind3 + "' ORDER BY " + strOrderBy + " " + strOrderType + "; ", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable GetRecordByValueList(string strTableName, string strFieldToFind, string strValueToFind, string strOrderBy = "", string strOrderType = "ASC")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            strValueToFind = strValueToFind != null && strValueToFind != "" ? strValueToFind.Replace("'", "█").Replace("/", " ⁄ ") : "";

            cmd = strOrderBy == "" ? new MySqlCommand("SELECT * FROM " + strTableName + " WHERE find_in_set(" + strFieldToFind + ", '"+ strValueToFind + "');", con) : new MySqlCommand("SELECT * FROM " + strTableName + " WHERE  find_in_set(" + strFieldToFind + ", '" + strValueToFind + "') ORDER BY " + strOrderBy + " "+ strOrderType + ";", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable GetRecordLikeValue(string strTableName, string strFieldToFind, string strValueToFind, string strConcat = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            strValueToFind = strValueToFind != null && strValueToFind != "" ? strValueToFind.Replace("'", "█").Replace("/", " ⁄ ") : "";

            cmd = strConcat == "" ? new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " LIKE '%" + strValueToFind + "%';", con) : new MySqlCommand("SELECT * FROM " + strTableName + " WHERE CONCAT (" + strFieldToFind + ") LIKE '%" + strValueToFind + "%';", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable GetRecordLikeTwoValues(string strTableName, string strFieldToFind, string strValueToFind, string strFieldToFindLike, string strValueToFindLike, string strOrderBy, string strOrderType = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            strFieldToFindLike = strFieldToFindLike.Replace("'", "█").Replace("/", " ⁄ ");

            cmd = new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strFieldToFind + " = "+ strValueToFind + " AND "+ strFieldToFindLike + " LIKE '%" + strValueToFindLike + "%' ORDER BY " + strOrderBy + " " + strOrderType + "; ", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        internal static DataTable CountIterationsByValue(string strTableName, string strFieldToFind, string strCountFieldName, string strFieldToGroup, string strOrderBy, string strOrderType)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();

            cmd = new MySqlCommand("SELECT "+ strFieldToFind + ", COUNT(*) AS "+ strCountFieldName + " FROM "+ strTableName + " GROUP BY "+ strFieldToGroup + " ORDER BY " + strOrderBy + " " + strOrderType + "; ", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Get a record using a specific field value
        /// </summary>
        /// <param name="strTableName"></param>
        /// <param name="strFieldName"></param>
        /// <param name="strFieldValue"></param>
        /// <returns></returns>
        internal static DataTable GetRecordByValues(string strTableName, string strField1, string strValue1, string strField2, string strValue2, string strLike2nd = "")
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            strValue1 = strValue1.Replace("'", "█").Replace("/", " ⁄ ");
            strValue2 = strValue2.Replace("'", "█").Replace("/", " ⁄ ");

            if (strLike2nd == "")
            {
                cmd = new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strField1 + " =@0 AND " + strField2 + " =@1;", con);
                cmd.Parameters.AddWithValue("@0", strValue1);
                cmd.Parameters.AddWithValue("@1", strValue2);
            }
            else
            {
                cmd = new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strField1 + " = " + strValue1  + " AND " + strField2 + " LIKE '%"+ strValue2 + "%';", con);
            }

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Get a record using a specific field with multiple values
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetRecordByValuesSameField(string strTableName, string strField, string strValueList)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            if (strValueList != "")
            {
                strValueList = strValueList.Replace("'", "█").Replace("/", " ⁄ ");

                cmd = new MySqlCommand("SELECT * FROM " + strTableName + " WHERE " + strField + " IN (" + strValueList + ");", con);

                if (con != null && con.State == ConnectionState.Closed)
                    con.Open();

                dt.Load(cmd.ExecuteReader());

                if (con != null && con.State == ConnectionState.Open)
                    con.Close();
            }

            return dt.Rows.Count > 0 ? dt : null;
        }

        /// <summary>
        /// Method to submit a new record into a table
        /// </summary>
        /// <param name="strTableName"></param>
        /// <param name="strFieldName"></param>
        /// <param name="strFieldValue"></param>
        internal static void InsertByTableName(string strTableName, List<string> strFieldName, List<string> strFieldValue)
        {
            string strCols = "";
            string strVals = "";

            for (int i = 0; i < strFieldName.Count; i++)
            {
                strCols = i == 0 ? strFieldName[i].ToString() : strCols + "," + strFieldName[i].ToString();
                if (strFieldName[i].ToString().Contains("Encrypted"))
                {
                    var varEncodedStr = System.Text.Encoding.UTF8.GetBytes(strFieldValue[i].ToString());
                    strVals = i == 0 ? "\'" + Convert.ToBase64String(varEncodedStr).ToString().Replace(',', '■').Replace('\'', '█') + "\'" : strVals + ",\'" + Convert.ToBase64String(varEncodedStr).ToString().Replace(',', '■').Replace('\'', '█') + "\'";
                }
                else
                {
                    strVals = i == 0 ? "\'" + strFieldValue[i].ToString().Replace(',', '■').Replace('\'', '█') + "\'" : strVals + ",\'" + strFieldValue[i].ToString().Replace(',', '■').Replace('\'', '█') + "\'";
                }
            }

            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            string strQuery = "INSERT INTO " + strTableName + "(" + strCols + ") VALUES (" + strVals + ");";
            cmd = new MySqlCommand(strQuery, con);


            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

        }

        internal static void DeleteByID(string strTableName, string strCol, int intVal, string strCol2 = "" , int intVal2 = 0)
        {

            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            string strQuery = strCol2 == "" ? "DELETE FROM " + strTableName + " WHERE " + strCol + " = '" + intVal + "';" : "DELETE FROM " + strTableName + " WHERE " + strCol + " = " + intVal + " AND " + strCol2 + " = " + intVal2 + ";";
            cmd = new MySqlCommand(strQuery, con);


            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="strTableName"></param>
        /// <param name="strValue"></param>
        /// <param name="strColumnName"></param>
        /// <param name="intRecordID"></param>
        internal static void UpdateSingleFieldByID(string strTableName, string strValue, string strColumnName, string strRefCol, int intRecordID)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            string strQuery = strValue != "" ? "UPDATE " + strTableName + " SET " + strColumnName +"='"+ strValue + "' WHERE " + strRefCol + " = " + intRecordID + ";" : "UPDATE " + strTableName + " SET " +strColumnName +" = NULL WHERE " + strRefCol + " = " + intRecordID + ";";
            cmd = new MySqlCommand(strQuery, con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

        }

        /// 
        /// </summary>
        /// <param name="strTableName"></param>
        /// <param name="strValue"></param>
        /// <param name="strColumnName"></param>
        /// <param name="intRecordID"></param>
        internal static void UpdateSingleFieldByTwoValues(string strTableName, string strValue, string strColumnName, string strRefCol1, string strRefCol2, int intRecordID, int intRecordID2)
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            string strQuery = strValue != "" ? "UPDATE " + strTableName + " SET " + strColumnName +"= '"+ strValue + "' WHERE " + strRefCol1 + " = " + intRecordID + "AND "+ strRefCol2 + " = " + intRecordID2 +";" : "UPDATE " + strTableName + " SET " + strColumnName + "=NULL WHERE " + strRefCol1 + " = " + intRecordID + "AND " + strRefCol2 + " = " + intRecordID2 + ";";
            cmd = new MySqlCommand(strQuery, con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();
            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="strTableName"></param>
        /// <param name="strFieldName"></param>
        /// <param name="strFieldValue"></param>
        /// <param name="strColumnName"></param>
        /// <param name="intRecordID"></param>
        internal static void UpdateByRecordID(string strTableName, List<string> strFieldName, List<string> strFieldValue, string strColumnName, int intRecordID, string strColumnName2 = "", int intRecordID2 = 0, string strCommaReplacement = "■")
        {
            string strFields = "";
            for (int i = 0; i < strFieldName.Count; i++)
            {
                if (strFieldName[i].ToString().Contains("Encrypted"))
                {
                    var varEncodedStr = System.Text.Encoding.UTF8.GetBytes(strFieldValue[i].ToString());
                    strFields = i == 0 ? strFieldName[i].ToString() + "=\'" + Convert.ToBase64String(varEncodedStr).ToString().Replace(',', '■').Replace('\'', '█') + "\'" : ", " + strFieldName[i].ToString() + "=\'" + Convert.ToBase64String(varEncodedStr).ToString().Replace(",", strCommaReplacement).Replace('\'', '█') + "\'";
                }
                else
                {
                    strFields = i == 0 ? strFieldName[i].ToString() +"=\'"+ strFieldValue[i].ToString().Replace(',', '■').Replace('\'', '█') + "\'" : strFields + ", " + strFieldName[i].ToString() + "=\'" + strFieldValue[i].ToString().Replace(",", strCommaReplacement).Replace('\'', '█') + "\'";
                }
            }

            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            string strQuery = strColumnName2 == "" ? "UPDATE " + strTableName + " SET " + strFields + " WHERE " + strColumnName + " = " + intRecordID + ";" : "UPDATE " + strTableName + " SET " + strFields + " WHERE " + strColumnName + " = " + intRecordID + " AND  " + strColumnName2 + " = " + intRecordID2 + ";";
            cmd = new MySqlCommand(strQuery, con);


            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();

        }

        /// <summary>
        /// Method to get content types
        /// </summary>
        /// <returns></returns>
        internal static DataTable GetContentTypes()
        {
            MySqlCommand cmd = null;
            DataTable dt = new DataTable();
            cmd = new MySqlCommand("SELECT * FROM databinger.contenttype AS ct WHERE ct.cntID != 100 ORDER BY cntName ASC", con);

            if (con != null && con.State == ConnectionState.Closed)
                con.Open();

            dt.Load(cmd.ExecuteReader());

            if (con != null && con.State == ConnectionState.Open)
                con.Close();
            return dt.Rows.Count > 0 ? dt : null;
        }

        #endregion

        public class Result
        {
            public Query query { get; set; }
        }

        public class Query
        {
            public Dictionary<string, Page> pages { get; set; }
        }

        public class Page
        {
            public string extract { get; set; }
        }

        public class SearchResult
        {
            public string Title { get; set; }
            public string Link { get; set; }
            public string Snippet { get; set; }
            public string Source { get; set; }
            public string Query { get; set; }
            public string Index { get; set; }
        }

        public static void ODS(string Msg)
        {
            String Out = String.Format("{0}  {1}",
                               DateTime.Now.ToString("hh:mm:ss.ff"), Msg);
            System.Diagnostics.Debug.WriteLine(Out);
        }
    }
}