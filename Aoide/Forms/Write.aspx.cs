using MediaBinger;
using Newtonsoft.Json.Linq;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Web;
using System.Web.Script.Serialization;
using System.Web.UI;
using System.Web.UI.WebControls;

namespace Aoide.Forms
{
    public partial class Write : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            DataTable dtTableData = ExtServices.GetTableNames();

            if (selectDBTable != null)
            {
                for (int i = 0; i < dtTableData.Rows.Count; i++)
                {
                    selectDBTable.Items.Add(new ListItem(dtTableData.Rows[i][1].ToString(), dtTableData.Rows[i][0].ToString()));
                }
            }
        }
        /// <summary>
        /// Method to create fields for each column on a table from database
        /// </summary>
        /// <param name="strTableName"></param>
        [System.Web.Services.WebMethod]
        public static string GetTableColumns(string strTableName="")
        {
            string strInnerHTML ="";
            DataTable dtTableData = ExtServices.GetTableColumns(strTableName);
            if (dtTableData != null)
            {
                //Start on 1 to avoid inserting main id field
                for (int i = 1; i < dtTableData.Rows.Count; i++)
                {
                    // If the field is not related to another table
                    string strOverridenColumns = "relFKdesc;relFKlineup;relFKwriters;relFKfeatures;relFKcovers";
                    if (!dtTableData.Rows[i][0].ToString().Contains("FK") || strOverridenColumns.Contains(dtTableData.Rows[i][0].ToString()))
                    {
                        strInnerHTML = strInnerHTML + "<input type='text' id='wrtField" + i + "' runat='server' class='form-control inputField input-lg wrtField' data-value='" + dtTableData.Rows[i][0].ToString() + "' placeholder='" + dtTableData.Rows[i][1].ToString() + "' value='' />";
                    }

                    //if the field is related to another table (FK)
                    else
                    {
                        // Get table name
                        string strForeignTableName = dtTableData.Rows[i][0].ToString().Substring(dtTableData.Rows[i][0].ToString().IndexOf("FK") + "FK".Length);
                        DataTable dtForeignTableData = ExtServices.GetContentByTableName(strForeignTableName);
                        if (dtForeignTableData != null && dtForeignTableData.Rows.Count > 0)
                        {
                            strInnerHTML = strInnerHTML + "<select id='wrtField" + i + "' runat='server' class='form-control inputField input-lg wrtField' data-value='" + dtTableData.Rows[i][0].ToString() + "'><option value='NaN'>" + dtTableData.Rows[i][1].ToString() + "</option>";
                            for (int j = 0; j < dtForeignTableData.Rows.Count; j++)
                            {
                                strInnerHTML = strInnerHTML + "<option value=" + dtForeignTableData.Rows[j][0] + ">" + dtForeignTableData.Rows[j][1] + "</option>";
                            }

                            strInnerHTML = strInnerHTML + "</select>";
                        }
                    }
                }
            }
            return strInnerHTML;
        }

        /// <summary>
        /// Method to submit data
        /// </summary>
        [System.Web.Services.WebMethod]
        public static void SubmitData(string strFieldID = "", string strFieldVal = "", string strTableName = "")
        {
            //Split strFieldID and strFieldVal
            List<string> lstCols = new List<string>();
            List<string> lstVals = new List<string>();

            object objCols = new JavaScriptSerializer().DeserializeObject(strFieldID);
            object objVals = new JavaScriptSerializer().DeserializeObject(strFieldVal);
            IEnumerable enumCols = objCols as IEnumerable;
            IEnumerable enumVals = objVals as IEnumerable;

            if (enumCols != null)
            {
                foreach (object objCol in enumCols)
                {
                    if (objCol != null)
                    {
                        lstCols.Add(objCol.ToString());
                    }
                }
            }

            if (enumVals != null)
            {
                foreach (object objVal in enumVals)
                {
                    if (objVal != null)
                    {
                        lstVals.Add(objVal.ToString());
                    }
                }
            }

            ExtServices.InsertByTableName(strTableName, lstCols, lstVals);

        }
        /// <summary>
        /// Method to update a record by ID
        /// </summary>
        /// <param name="strFieldID"></param>
        /// <param name="strFieldVal"></param>
        /// <param name="strTableName"></param>
        /// <param name="strRecordId"></param>
        [System.Web.Services.WebMethod]
        public static void UpdateData(string strFieldID = "", string strFieldVal = "", string strTableName = "", string strRecordId ="0")
        {
            //Split strFieldID and strFieldVal
            List<string> lstCols = new List<string>();
            List<string> lstVals = new List<string>();

            object objCols = new JavaScriptSerializer().DeserializeObject(strFieldID);
            object objVals = new JavaScriptSerializer().DeserializeObject(strFieldVal);
            IEnumerable enumCols = objCols as IEnumerable;
            IEnumerable enumVals = objVals as IEnumerable;

            if (enumCols != null)
            {
                foreach (object objCol in enumCols)
                {
                    if (objCol != null)
                    {
                        lstCols.Add(objCol.ToString());
                    }
                }
            }

            if (enumVals != null)
            {
                foreach (object objVal in enumVals)
                {
                    if (objVal != null)
                    {
                        lstVals.Add(objVal.ToString());
                    }
                }
            }

            //Get ID column name
            DataTable dtTableData = ExtServices.GetTableColumns(strTableName);
            //Update fields
            ExtServices.UpdateByRecordID(strTableName, lstCols, lstVals, dtTableData.Rows[0][0].ToString(), Convert.ToInt32(strRecordId));

        }
        /// <summary>
        /// Method to retrieve data
        /// </summary>
        [System.Web.Services.WebMethod]
        public static string RetrieveData (string strFieldID = "", string strFieldVal = "", string strTableName = "")
        {
            string strInnerHTML = "";

            //Split strFieldID and strFieldVal
            List<string> lstCols = new List<string>();
            List<string> lstVals = new List<string>();

            object objCols = new JavaScriptSerializer().DeserializeObject(strFieldID);
            object objVals = new JavaScriptSerializer().DeserializeObject(strFieldVal);
            IEnumerable enumCols = objCols as IEnumerable;
            IEnumerable enumVals = objVals as IEnumerable;

            if (enumCols != null)
            {
                foreach (object objCol in enumCols)
                {
                    if (objCol != null)
                    {
                        lstCols.Add(objCol.ToString());
                    }
                }
            }

            if (enumVals != null)
            {
                foreach (object objVal in enumVals)
                {
                    if (objVal != null)
                    {
                        lstVals.Add(objVal.ToString());
                    }
                }
            }

            //Get the value and field to find
            string strFieldToFind = "";
            string strValueToFind = "";

            for (int i = 0; i < lstCols.Count; i++)
            {
                if (lstVals[i].ToString() != "" && lstVals[i].ToString() != "NaN")
                {
                    strFieldToFind = lstCols[i].ToString();
                    strValueToFind = lstVals[i].ToString();
                    break;
                }
            }

            DataTable dtTableData = ExtServices.GetTableColumns(strTableName);
            DataTable dtRecordData = strFieldToFind != "" ? ExtServices.GetRecordByValue(strTableName, strFieldToFind, strValueToFind) : null;
            //Start on 1 to avoid inserting main id field
            if (dtRecordData != null && dtRecordData.Rows.Count > 0)
            {
                for (int i = 0; i < dtTableData.Rows.Count; i++)
                {
                    // If the field is not related to another table and is primary key
                    if (i == 0 && !dtTableData.Rows[i][0].ToString().Contains("FK"))
                    {
                        strInnerHTML = strInnerHTML + "<input name='" + dtTableData.Rows[i][0].ToString() + "' type='text' id='wrtField" + i + "' runat='server' style='display:none' class='form-control inputField input-lg wrtField' data-value='" + dtTableData.Rows[i][0].ToString() + "' placeholder ='" + dtTableData.Rows[i][1].ToString() + "' value='" + dtRecordData.Rows[0][dtTableData.Rows[i][0].ToString()].ToString() +"' />";    
                    }
                    // If the field is not related to another table
                    else if ( i > 0 && !dtTableData.Rows[i][0].ToString().Contains("FK"))
                    {
                        strInnerHTML = strInnerHTML + "<input name='" + dtTableData.Rows[i][0].ToString() + "' type='text' id='wrtField" + i + "' runat='server' class='form-control inputField input-lg wrtField' data-value='" + dtTableData.Rows[i][0].ToString() + "' placeholder='" + dtTableData.Rows[i][1].ToString() + "' value='" + dtRecordData.Rows[0][dtTableData.Rows[i][0].ToString()].ToString() + "' />";
                    }
                    //if the field is related to another table (FK)
                    else
                    {
                        // Get table name
                        string strForeignTableName = dtTableData.Rows[i][0].ToString().Substring(dtTableData.Rows[i][0].ToString().IndexOf("FK") + "FK".Length);
                        DataTable dtForeignTableData = ExtServices.GetContentByTableName(strForeignTableName);
                        if (dtForeignTableData != null && dtForeignTableData.Rows.Count > 0)
                        {
                            strInnerHTML = strInnerHTML + "<select id='wrtField" + i + "' runat='server' class='form-control inputField input-lg wrtField' data-value='" + dtTableData.Rows[i][0].ToString() + "'><option value='NaN'>" + dtTableData.Rows[i][1].ToString() + "</option>";
                            for (int j = 0; j < dtForeignTableData.Rows.Count; j++)
                            {
                                strInnerHTML = dtForeignTableData.Rows[j][0].ToString() != dtRecordData.Rows[0][i].ToString() ? strInnerHTML + "<option value=" + dtForeignTableData.Rows[j][0] + ">" + dtForeignTableData.Rows[j][1] + "</option>" : strInnerHTML + "<option value=" + dtForeignTableData.Rows[j][0] + " selected>" + dtForeignTableData.Rows[j][1] + "</option>";
                            }

                            strInnerHTML = strInnerHTML + "</select>";
                        }
                    }
                }
            }

            else
            {
                for (int i = 1; i < dtTableData.Rows.Count; i++)
                {
                    if (!dtTableData.Rows[i][0].ToString().Contains("FK"))
                    {
                        strInnerHTML = strInnerHTML + "<input name='" + dtTableData.Rows[i][0].ToString() + "' type='text' id='wrtField" + i + "' runat='server' class='form-control inputField input-lg wrtField' data-value='" + dtTableData.Rows[i][0].ToString() + "' placeholder='" + dtTableData.Rows[i][1].ToString() + "' value='' />";
                    }

                    //if the field is related to another table (FK)
                    else
                    {
                        // Get table name
                        string strForeignTableName = dtTableData.Rows[i][0].ToString().Substring(dtTableData.Rows[i][0].ToString().IndexOf("FK") + "FK".Length);
                        DataTable dtForeignTableData = ExtServices.GetContentByTableName(strForeignTableName);
                        if (dtForeignTableData != null && dtForeignTableData.Rows.Count > 0)
                        {
                            strInnerHTML = strInnerHTML + "<select id='wrtField" + i + "' runat='server' class='form-control inputField input-lg wrtField' data-value='" + dtTableData.Rows[i][0].ToString() + "'><option value='NaN'>Select an option</option>";
                            for (int j = 0; j < dtForeignTableData.Rows.Count; j++)
                            {
                                strInnerHTML = strInnerHTML + "<option value=" + dtForeignTableData.Rows[j][0] + ">" + dtForeignTableData.Rows[j][1] + "</option>";
                            }

                            strInnerHTML = strInnerHTML + "</select>";
                        }
                    }
                }
            }

            return strInnerHTML;

        }
    }
}